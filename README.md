# taxes

Turns PDF Bank statements into a CSV file using AI. Tested with TD Bank statements. This used to be a really difficult problem. Not 100% accurate but good enough to be dangerous (>99%).

## Requires

- OpenAI key
- NodeJS

## Steps

- add `.env` file to repository folder with `OPEN_AI_KEY`
- add multiple account and statement pdfs as `./in/{my-account}/{my-statement}.pdf`
- fire `npm start`
- get results in `./out/transactions-{timestamp}.csv`
