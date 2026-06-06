const { readJsonFile, saveResultReport, printReport } = require("../src/utils/fsUtils");
const { runSemiAutoJobInspector } = require("../src/semiAutoJobInspector");
const { baseSemiAutoInspectResult } = require("../src/reports/semiAutoInspectResultBuilder");
const { ERROR_TYPES } = require("../src/errors/errorTypes");

function parseArgs(argv) {
  const urlIndex = argv.findIndex((arg) => arg === "--url");
  const platformIndex = argv.findIndex((arg) => arg === "--platform");
  const inputIndex = argv.findIndex((arg) => arg === "--input");
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    url: urlIndex >= 0 ? argv[urlIndex + 1] : "",
    platform: platformIndex >= 0 ? argv[platformIndex + 1] : "",
    input: inputIndex >= 0 ? argv[inputIndex + 1] : "",
    noRateLimit: argv.includes("--no-rate-limit")
  };
}

function printUsage() {
  console.log(`
JobPilot semi-auto job inspector

Usage:
  node scripts\\semi_auto_job_inspector.js --url "岗位链接" --platform "智联招聘"
  node scripts\\semi_auto_job_inspector.js --input config\\semi_auto_job_inspect.example.json
  npm run semi-auto:inspect -- --url "https://..." --platform "智联招聘"

Safety:
  Only reads visible job text after user-handled login/captcha.
  No submit, no login automation, no captcha bypass, no resume upload, no HR message.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  let instruction;
  if (args.input) {
    try {
      instruction = readJsonFile(args.input);
    } catch (error) {
      const report = baseSemiAutoInspectResult({
        stopped: true,
        stopReason: `Failed to read instruction JSON: ${error.message}`,
        errorType: ERROR_TYPES.INVALID_INSTRUCTION
      });
      const reportPath = saveResultReport(report, "semi_auto_job_inspect_result");
      printReport(report, reportPath);
      process.exitCode = 1;
      return;
    }
  } else if (!args.url) {
    printUsage();
    const report = baseSemiAutoInspectResult({
      stopped: true,
      stopReason: "Missing --url or --input.",
      errorType: ERROR_TYPES.INVALID_INSTRUCTION
    });
    const reportPath = saveResultReport(report, "semi_auto_job_inspect_result");
    printReport(report, reportPath);
    process.exitCode = 1;
    return;
  }

  const report = await runSemiAutoJobInspector({
    instruction,
    url: args.url,
    platform: args.platform,
    noRateLimit: args.noRateLimit
  });
  const reportPath = saveResultReport(report, "semi_auto_job_inspect_result");
  printReport(report, reportPath);
  if (report.screenshotPath) console.log(`截图已保存：${report.screenshotPath}`);
  console.log("你可以将 extractedTextPreview 复制到 JobPilot 的“岗位体检中心”继续分析。");
  if (report.errorType === ERROR_TYPES.INVALID_INSTRUCTION) process.exitCode = 1;
}

main();
