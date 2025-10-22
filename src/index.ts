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

	const parsedTransactions: {
		account: string;
		statement: string;
		beginningBalance: number;
		endBalance: number;
		postingDate: string;
		description: string;
		amount: number;
	}[] = [];

	for (const pdf of preparedPdfs) {
		await pRetry(async () => {
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
							.describe("deposits: positive, payments: negative"),
					}),
				),
			});

			console.log(`asking LLM to parse ./in/${pdf.account}/${pdf.statement}`);

			const response = await llm.responses.parse({
				model: "gpt-4o-mini",
				instructions: "you are a data entry specialist",
				input: [
					{
						role: "system",
						content: "extract data from this bank statement",
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

				for (const tx of parsedStatement.transactions) {
					parsedTransactions.push({
						account: pdf.account,
						statement: pdf.statement,
						beginningBalance: parsedStatement.beginningBalance,
						endBalance: parsedStatement.endingBalance,
						postingDate: tx.postingDate,
						description: tx.description,
						amount: tx.amount,
					});
					console.log(Object.values(parsedTransactions[0]));
				}
			} catch (e) {
				console.log(`error: ${response.output_text}`);
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
		});
	}

	const completionTimestamp = Date.now();

	console.log(
		`completed in ${((runTimestamp - completionTimestamp) / 1000).toFixed(0)} seconds`,
	);
}
