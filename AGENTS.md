# AGENTS.md

## 项目简介

基于 Astro v7 + AstroPaper v6 的个人技术博客，部署在 GitHub Pages。

- **线上地址**：https://midsummer-q.github.io/blog/
- **技术栈**：Astro 7、TypeScript、Tailwind CSS v4、MDX
- **语言**：中文 (zh-CN)，时区 Asia/Shanghai
- **作者**：midsummer-q

## 目录结构

```
astro-paper.config.ts   ← 站点主配置（标题、作者、社交链接等），优先编辑此文件
astro.config.ts         ← Astro 框架配置（base 路径、Markdown 插件、Shiki 主题等）
src/
  config.ts             ← 解析默认值的内部模块，不要直接修改
  content/
    posts/              ← 博客文章（Markdown / MDX），唯一的文章目录
    pages/              ← 独立页面（如 about.md）
  content.config.ts     ← 内容集合的 Schema 定义（Zod）
  components/           ← Astro 组件
  layouts/              ← 页面布局
  pages/                ← 路由页面
  styles/               ← 全局样式
  utils/                ← 工具函数（含 Shiki 自定义 transformer）
  scripts/              ← 客户端脚本
public/                 ← 静态资源（favicon、OG 图片等）
scripts/
  deploy.py             ← 部署脚本
  copy-pagefind.js      ← Pagefind 索引复制脚本
dist/                   ← 构建产物（git 已跟踪）
```

## 博客文章规范

文章放在 `src/content/posts/`，文件名使用 **kebab-case**（如 `my-new-post.md`）。

### Frontmatter 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 文章标题 |
| `description` | string | ✅ | 文章摘要，用于 SEO 和 OG |
| `pubDatetime` | date | ✅ | 发布时间，ISO 8601 格式（如 `2026-10-12T05:00:00Z`） |
| `author` | string | ❌ | 默认取配置中的 `site.author` |
| `modDatetime` | date \| null | ❌ | 最后修改时间 |
| `featured` | boolean | ❌ | 是否为精选文章 |
| `draft` | boolean | ❌ | 设为 `true` 则不发布 |
| `tags` | string[] | ❌ | 标签数组，默认 `["others"]` |
| `series` | string \| { name: string, order?: number } | ❌ | 所属专栏系列，如 `name: 计算机底层与设计哲学` |
| `ogImage` | string \| image | ❌ | 自定义 OG 图片 |
| `canonicalURL` | string | ❌ | 规范链接 |
| `hideEditPost` | boolean | ❌ | 隐藏「编辑此文」按钮 |
| `timezone` | string | ❌ | 覆盖全局时区 |

### Frontmatter 示例

```yaml
---
author: Admin
pubDatetime: 2026-10-12T05:00:00Z
title: 文章标题
featured: true
draft: false
tags:
  - 标签一
  - 标签二
series:
  name: 专栏系列名称
  order: 1
description: 简短描述，一到两句话概括文章内容。
---
```

### 独立页面

放在 `src/content/pages/`，frontmatter 只需 `title`，可选 `description`、`ogImage`、`canonicalURL`。

## Markdown 功能

文章中可以使用以下扩展语法：

- **数学公式**：使用 `$...$`（行内）和 `$$...$$`（块级），由 remark-math + rehype-katex 渲染
- **Callout 提示框**：使用 `[!NOTE]`、`[!WARNING]` 等语法，由 rehype-callouts 渲染
- **代码高亮**：Shiki 双主题（亮色 min-light / 暗色 night-owl），支持 diff 标注、行高亮、词高亮、文件名标注
- **目录生成**：使用 remark-toc，写 `## Table of contents` 标题即可自动生成
- **MDX**：支持 `.mdx` 文件，可在 Markdown 中使用 Astro 组件

## ⚠️ 注意事项

### Base 路径

站点部署在 `/blog/` 子路径下（`astro.config.ts` 中 `base: "/blog"`）。所有内部链接、资源引用、sitemap 和 robots.txt 中的 URL 都必须考虑此前缀。Astro 模板中通常会自动处理，但在手写路径或配置文件中需要特别注意。

### 外部链接

引用外部资源时需验证链接可访问。项目曾因失效链接出过问题（见 commit `2051510`），添加外链后建议检查一遍。

### Markdown 语法

中文内容中使用强调语法（`*斜体*`、`**粗体**`）时，注意与中文字符的边界，必要时在标记前后加空格以确保正确解析。

### 配置文件

修改站点配置请编辑 `astro-paper.config.ts`。`src/config.ts` 是解析默认值的内部模块，不应直接修改。

## 构建与部署

```bash
npm run dev       # 启动本地开发服务器
npm run build     # 类型检查 → Astro 构建 → Pagefind 索引生成
npm run preview   # 预览构建产物
npm run deploy    # 构建并通过 deploy.py 部署
```

构建流程：`astro check` → `astro build` → `pagefind --site dist`

## 代码风格

项目使用 Prettier 格式化，主要规则：

- 缩进：2 空格
- 分号：有
- 引号：双引号（`""`）
- 尾逗号：ES5 风格
- 行宽：80 字符
- 换行符：LF
- 箭头函数单参数：省略括号

格式化命令：

```bash
npm run format        # 格式化所有文件
npm run format:check  # 仅检查格式
npm run lint          # ESLint 检查
```

## 标签风格

标签使用中文，采用具体的技术领域描述（如「数据结构」「Linux 内核」「系统级编程」「架构设计」），而非泛泛的分类。
