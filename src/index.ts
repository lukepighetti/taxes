import fsSync from "node:fs";
import fs from "node:fs/promises";
import dotenv from "dotenv";
import * as csv from "fast-csv";
import OpenAI from "openai";
import pRetry from "p-retry";
import { z } from "zod";

main();

async function main() {
	const env = dotenv.config().parsed as { OPEN_AI_KEY: string };

	const runTimestamp = Date.now();

	// 1. get folders and pdfs
	const preparedPdfs: {
		account: string;
		statement: string;
		pdf: NonSharedBuffer;
	}[] = [];

	const accounts = await fs.readdir("in");
	for (const account of accounts) {
		const statements = await fs.readdir(`in/${account}`);
		// console.log({ account, statements });
		for (const statement of statements) {
			const pdf = await fs.readFile(`in/${account}/${statement}`);
			preparedPdfs.push({ account, statement, pdf });
		}
	}

	// 2. ask LLM to read through PDFs and extract transactions
	const llm = new OpenAI({ apiKey: env.OPEN_AI_KEY });

	type ParsedTransaction = {
		account: string;
		statement: string;
		beginningBalance: number;
		endBalance: number;
		postingDate: string;
		description: string;
		amount: number;
	};

	const parsedTransactions: ParsedTransaction[] = [];

	for (const pdf of preparedPdfs) {
		await pRetry(
			async () => {
				const Statement = z.object({
					startDate: z.string(),
					endDate: z.string(),
					beginningBalance: z.number(),
					endingBalance: z.number(),
					transactions: z.array(
						z.object({
							postingDate: z.string().describe("MM/DD"),
							description: z.string(),
							amount: z
								.number()
								.describe(
									"deposits: positive, payments & service charges: negative",
								),
						}),
					),
				});

				console.log(`asking LLM to parse ./in/${pdf.account}/${pdf.statement}`);

				const response = await llm.responses.parse({
					model: "gpt-5-mini",
					instructions: "you are a data entry specialist",
					input: [
						{
							role: "system",
							content:
								"extract deposits, payments, and service charges from this bank statement",
						},
						{
							role: "user",
							content: [
								{
									type: "input_file",
									filename: "file.pdf",
									file_data: `data:application/pdf;base64,${pdf.pdf.toString("base64")}`,
								},
							],
						},
					],
					text: {
						format: {
							schema: z.toJSONSchema(Statement),
							type: "json_schema",
							name: "schema",
						},
					},
				});

				try {
					const parsedStatement = Statement.parse(
						JSON.parse(response.output_text),
					);

					const txs: ParsedTransaction[] = [];
					for (const tx of parsedStatement.transactions) {
						txs.push({
							account: pdf.account,
							statement: pdf.statement,
							beginningBalance: parsedStatement.beginningBalance,
							endBalance: parsedStatement.endingBalance,
							postingDate: tx.postingDate,
							description: tx.description,
							amount: tx.amount,
						});
					}

					// 2a. error check (out of balance)
					const { beginningBalance, endBalance } = txs[0];
					const txSum = txs.map((e) => e.amount).reduce((a, b) => a + b);
					const delta = beginningBalance + txSum - endBalance;
					if (delta > 0.01) {
						console.log(`out of balance by ${delta}`);
						throw Error("out-of-balance");
					}

					console.log(`success parsing ${txs.length} transactions`);

					parsedTransactions.push(...txs);
				} catch (e) {
					console.log(`error: ${e}`);

					// pRetry fails on TypeError, let's repackage it
					if (e instanceof TypeError) {
						console.log(`error: ${e} for ${response.output_text}`);
						throw Error(`${e}`);
					}

					throw e;
				}

				// 3. save to disk
				const csvStream = csv.format({ headers: true });
				csvStream.pipe(
					fsSync.createWriteStream(`out/transactions-${runTimestamp}.csv`),
				);
				for (const tx of parsedTransactions) {
					csvStream.write(tx);
				}
				csvStream.end();
			},
			{
				onFailedAttempt: (x) =>
					console.log(`retrying n=${x.attemptNumber}, left=${x.retriesLeft}`),
			},
		);
	}

	const completionTimestamp = Date.now();

	console.log(
		`completed in ${((runTimestamp - completionTimestamp) / 1000).toFixed(0)} seconds`,
	);
}
