function inferPlatformFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "未知平台";
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  const query = parsed.search.toLowerCase();

  if (host.includes("zhaopin.com")) return "智联招聘";
  if (host.includes("zhipin.com")) return "BOSS直聘";
  if (host.includes("liepin.com")) return "猎聘";
  if (host.includes("51job.com")) return "前程无忧";
  if (host.includes("xiaohongshu.com")) return "小红书";
  if (host.includes("weixin.qq.com") || host.includes("mp.weixin.qq.com")) return "公众号文章";
  if (host.includes("feishu.cn") || host.includes("larksuite.com")) return "飞书表单";
  if (host.includes("jobs.lever.co") || host.includes("greenhouse.io") || host.includes("boards.greenhouse.io") || host.includes("job-boards.greenhouse.io")) return "公司官网";
  if (host.includes("greenhouse.com") && isCareerPath(pathname)) return "公司官网";
  if (host.includes("workable.com") || host.includes("apply.workable.com")) return "公司官网";
  if (host.includes("ashbyhq.com") || host.includes("smartrecruiters.com")) return "公司官网";
  if (host.includes("career") || host.includes("careers") || host.includes("jobs")) return "公司官网";
  if (isCareerPath(pathname) || hasJobQuerySignal(query)) return "公司官网";

  return "未知平台";
}

function isCareerPath(pathname) {
  const patterns = [
    "/careers",
    "/career",
    "/jobs",
    "/job",
    "/join-us",
    "/joinus",
    "/talent",
    "/recruitment",
    "/open-positions",
    "/positions",
    "/vacancies",
    "/apply"
  ];
  return patterns.some((pattern) => String(pathname || "").includes(pattern));
}

function hasJobQuerySignal(query) {
  return /[?&](jobid|job_id|positionid|position_id|gh_jid)=/i.test(String(query || ""));
}

module.exports = {
  inferPlatformFromUrl,
  isCareerPath,
  hasJobQuerySignal
};
