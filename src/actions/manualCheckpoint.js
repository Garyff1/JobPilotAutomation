const readline = require("readline");

function waitForEnter(message = "", input = process.stdin, output = process.stdout) {
  if (message) output.write(`${message}\n`);
  const rl = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    rl.question("按 Enter 继续，或按 Ctrl+C 退出。", () => {
      rl.close();
      resolve({ continued: true, completedAt: new Date().toISOString() });
    });
  });
}

async function manualCheckpoint({ reason = "", promptFn = waitForEnter } = {}) {
  const message = [
    "检测到登录/验证码/安全验证。",
    "请在打开的浏览器窗口中手动完成登录或验证。",
    "完成后回到终端继续。"
  ];
  if (reason) message.push(`触发原因：${reason}`);
  return promptFn(message.join("\n"));
}

module.exports = {
  manualCheckpoint,
  waitForEnter
};
