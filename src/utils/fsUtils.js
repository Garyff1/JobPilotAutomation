const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");
const SCREENSHOTS_DIR = path.join(REPORTS_DIR, "screenshots");

function ensureDirectories() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveFromRoot(...segments) {
  return path.join(ROOT_DIR, ...segments);
}

function readJsonFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return JSON.parse(raw);
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function saveResultReport(report, prefix = "full_auto_prepare_result") {
  ensureDirectories();
  const reportPath = path.join(REPORTS_DIR, `${prefix}_${timestamp()}.json`);
  writeJsonFile(reportPath, report);
  return reportPath;
}

function printReport(report, reportPath) {
  console.log("\n===== CHECK REPORT =====");
  console.log(JSON.stringify(report, null, 2));
  console.log("===== END REPORT =====");
  if (reportPath) {
    console.log(`\nReport saved: ${reportPath}`);
  }
}

module.exports = {
  ROOT_DIR,
  REPORTS_DIR,
  SCREENSHOTS_DIR,
  ensureDirectories,
  timestamp,
  resolveFromRoot,
  readJsonFile,
  writeJsonFile,
  saveResultReport,
  printReport
};
