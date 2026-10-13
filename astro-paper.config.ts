import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://midsummer-q.github.io/blog/",
    title: "Midsummer's Blog",
    description: "记录技术探索、计算机底层思考与日常学习笔记。",
    author: "midsummer-q",
    profile: "https://github.com/midsummer-q",
    ogImage: "default-og.jpg",
    lang: "zh-CN",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/midsummer-q/blog/edit/main/",
    },
    search: "pagefind",
    // Giscus 评论系统（基于 GitHub Discussions）
    // 前往 https://giscus.app 获取 repoId 与 categoryId 填入后将 enabled 设为 true 即可启用
    giscus: {
      enabled: false,
      repo: "midsummer-q/blog",
      repoId: "", // 例如 "R_kgDO..."
      category: "General",
      categoryId: "", // 例如 "DIC_kwDO..."
      mapping: "pathname",
      reactionsEnabled: true,
      lang: "zh-CN",
      lightTheme: "light",
      darkTheme: "transparent_dark",
    },
  },
  // 访问统计分析配置（支持 Umami 与 Google Analytics）
  analytics: {
    // Umami（自建或云端实例，推荐）
    // umami: {
    //   websiteId: "your-umami-website-id",
    //   scriptUrl: "https://cloud.umami.is/script.js",
    // },
    // Google Analytics
    // googleAnalytics: {
    //   id: "G-XXXXXXXXXX",
    // },
  },
  socials: [
    { name: "github",   url: "https://github.com/midsummer-q" },
    { name: "mail",     url: "mailto:1776122348@qq.com" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});