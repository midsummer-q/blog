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
    perPage: 10,
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
    giscus: {
      enabled: true,
      repo: "midsummer-q/blog",
      repoId: "R_kgDOVE4_Yw",
      category: "Announcements",
      categoryId: "DIC_kwDOVE4_Y84DIT_a",
      mapping: "pathname",
      reactionsEnabled: true,
      lang: "zh-CN",
      lightTheme: "light",
      darkTheme: "transparent_dark",
    },
  },
  // 访问统计分析配置（支持 Umami 与 Google Analytics）
  analytics: {
    // Umami 云端实例统计
    umami: {
      websiteId: "c2970c20-9da9-4477-a424-af19e5f5d402",
    },
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