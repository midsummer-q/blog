import type { UIStrings } from "../types";

export default {
  nav: {
    home: "首页",
    posts: "文章",
    tags: "标签",
    about: "关于",
    archives: "归档",
    search: "搜索",
    lab: "实验室",
  },
  post: {
    publishedAt: "发布于",
    updatedAt: "更新于",
    sharePostIntro: "分享这篇文章：",
    sharePostOn: "在 {{platform}} 上分享",
    sharePostViaEmail: "通过邮件分享",
    tagLabel: "标签",
    backToTop: "返回顶部",
    goBack: "返回",
    editPage: "编辑页面",
    previousPost: "上一篇",
    nextPost: "下一篇",
  },
  pagination: {
    prev: "上一页",
    next: "下一页",
    page: "页码",
  },
  home: {
    socialLinks: "社交账号",
    featured: "精选文章",
    recentPosts: "最新文章",
    allPosts: "查看所有文章",
  },
  footer: {
    copyright: "版权所有",
    allRightsReserved: "保留所有权利。",
  },
  pages: {
    tagTitle: "标签",
    tagDesc: "所有包含该标签的文章",

    tagsTitle: "所有标签",
    tagsDesc: "博客文章所使用的全部标签集合。",

    postsTitle: "文章列表",
    postsDesc: "所有发布的文章列表。",

    archivesTitle: "文章归档",
    archivesDesc: "按时间排布的历史文章归档。",

    searchTitle: "全站搜索",
    searchDesc: "搜索博客中的任何文章或关键词...",
  },
  a11y: {
    skipToContent: "跳至主要内容",
    openMenu: "打开菜单",
    closeMenu: "关闭菜单",
    toggleTheme: "切换浅色/深色主题",
    searchPlaceholder: "输入关键词搜索文章...",
    noResults: "没有找到匹配的内容",
    goToPreviousPage: "前往上一页",
    goToNextPage: "前往下一页",
  },
  notFound: {
    title: "404 页面未找到",
    message: "抱歉，你访问的页面不存在或已被移除。",
    goHome: "返回首页",
  },
} satisfies UIStrings;
