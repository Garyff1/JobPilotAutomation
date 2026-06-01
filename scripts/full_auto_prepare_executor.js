const { readJsonFile, saveResultReport, printReport } = require("../src/utils/fsUtils");
const { baseResult } = require("../src/reports/resultBuilder");
const { ERROR_TYPES } = require("../src/errors/errorTypes");
const { runFullAutoPrepare } = require("../src/fullAutoPrepareRunner");

function parseArgs(argv) {
  const inputIndex = argv.findIndex((arg) => arg === "--input");
  const storageStateIndex = argv.findIndex((arg) => arg === "--storage-state");
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    input: inputIndex >= 0 ? argv[inputIndex + 1] : undefined,
    keepOpen: argv.includes("--keep-open"),
    storageStatePath: storageStateIndex >= 0 ? argv[storageStateIndex + 1] : "",
    noRateLimit: argv.includes("--no-rate-limit")
  };
}

function printUsage() {
  console.log(`
JobPilot company website dryRun executor

Usage:
  node scripts\\full_auto_prepare_executor.js --input instruction.json
  npm run full-auto:dryrun -- --input config\\full_auto_prepare_instruction.example.json

Options:
  --keep-open   Keep the browser open after dryRun for manual inspection.
  --storage-state path\\to\\state.json
                Optional explicit Playwright storageState file. Disabled by default.
  --no-rate-limit
                Skip the local rate-limit wait for this run.

Safety:
  prepare_application_form only. No submit, no login, no captcha bypass,
  no file upload, no sensitive fields, no unknown fields.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.input) {
    const report = baseResult(undefined, {
      stopped: true,
      stopReason: "Missing --input instruction.json.",
      errorType: ERROR_TYPES.INVALID_INSTRUCTION
    });
    const reportPath = saveResultReport(report);
    printReport(report, reportPath);
    process.exitCode = 1;
    return;
  }

  let instruction;
  try {
    instruction = readJsonFile(args.input);
  } catch (error) {
    const report = baseResult(undefined, {
      stopped: true,
      stopReason: `Failed to read instruction JSON: ${error.message}`,
      errorType: ERROR_TYPES.INVALID_INSTRUCTION
    });
    const reportPath = saveResultReport(report);
    printReport(report, reportPath);
    process.exitCode = 1;
    return;
  }

  const report = await runFullAutoPrepare({ instruction, keepOpen: args.keepOpen, storageStatePath: args.storageStatePath, noRateLimit: args.noRateLimit });
  const reportPath = saveResultReport(report);
  printReport(report, reportPath);
  if (report.errorType || report.stopped) {
    process.exitCode = 1;
  }
}

main();
