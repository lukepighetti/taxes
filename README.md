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

## Limitations

- `./in` file structure has to be clean. No random files like `.DS_Store`
- we are getting statement `beginningBalance` and `endingBalance` but not checking the transaction sum against it
- currently >99% accurate but not 100%

## Example

| account | statement      | beginningBalance | endBalance | postingDate | description             | amount |
| ------- | -------------- | ---------------- | ---------- | ----------- | ----------------------- | ------ |
| x1234   | 2024-01-31.pdf | 9642.59          | 8487.57    | 01/04       | Apple Inc ACH/CRED      | 12.27  |
| x1234   | 2024-01-31.pdf | 9642.59          | 8487.57    | 01/12       | PELOTON SYS DIR DEP     | 48.93  |
| x1234   | 2024-01-31.pdf | 9642.59          | 8487.57    | 01/16       | GOOGLE MULTIPLE_S       | -17.23  |
| x1234   | 2024-01-31.pdf | 9642.59          | 8487.57    | 01/26       | PELOTON SYS DIR DEP 354 | 48.93  |

_Note: `beginningBalance` and `endBalance` are for the statement and are intended for error checking_
