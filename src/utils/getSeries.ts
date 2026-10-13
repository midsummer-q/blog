import type { CollectionEntry } from "astro:content";
import { slugifyStr } from "./slugify";

export interface PostSeriesInfo {
  name: string;
  order: number;
}

export interface SeriesMeta {
  name: string;
  slug: string;
  count: number;
  latestDate: Date;
}

/**
 * 解析文章的 series 字段为统一对象
 */
export function getPostSeriesInfo(
  series: CollectionEntry<"posts">["data"]["series"]
): PostSeriesInfo | null {
  if (!series) return null;
  if (typeof series === "string") {
    return { name: series.trim(), order: 1 };
  }
  return {
    name: series.name.trim(),
    order: typeof series.order === "number" ? series.order : 1,
  };
}

/**
 * 获取全站所有专栏系列列表
 */
export function getUniqueSeries(
  posts: CollectionEntry<"posts">[]
): SeriesMeta[] {
  const map = new Map<string, { count: number; latestDate: Date }>();

  for (const post of posts) {
    if (post.data.draft) continue;
    const info = getPostSeriesInfo(post.data.series);
    if (!info) continue;

    const existing = map.get(info.name);
    const postDate = new Date(post.data.modDatetime ?? post.data.pubDatetime);

    if (existing) {
      existing.count += 1;
      if (postDate > existing.latestDate) {
        existing.latestDate = postDate;
      }
    } else {
      map.set(info.name, {
        count: 1,
        latestDate: postDate,
      });
    }
  }

  const result: SeriesMeta[] = [];
  for (const [name, data] of map.entries()) {
    result.push({
      name,
      slug: slugifyStr(name),
      count: data.count,
      latestDate: data.latestDate,
    });
  }

  // 按最新更新时间降序排列
  return result.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());
}

/**
 * 获取指定专栏系列的所有文章，并按 order 升序排列
 */
export function getPostsBySeries(
  posts: CollectionEntry<"posts">[],
  seriesName: string
): CollectionEntry<"posts">[] {
  return posts
    .filter(post => {
      if (post.data.draft) return false;
      const info = getPostSeriesInfo(post.data.series);
      return info && (info.name === seriesName || slugifyStr(info.name) === seriesName);
    })
    .sort((a, b) => {
      const infoA = getPostSeriesInfo(a.data.series)!;
      const infoB = getPostSeriesInfo(b.data.series)!;

      if (infoA.order !== infoB.order) {
        return infoA.order - infoB.order;
      }

      return (
        new Date(a.data.pubDatetime).getTime() -
        new Date(b.data.pubDatetime).getTime()
      );
    });
}
