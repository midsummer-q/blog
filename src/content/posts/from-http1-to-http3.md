---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
title: 从 HTTP/1.1 到 HTTP/3：协议在解决什么问题？
featured: false
draft: false
ogImage: ../../assets/images/network-basics/13-http-evolution-og.png
tags:
  - 计算机网络
  - 超文本传输协议
  - QUIC协议
series:
  name: 计算机网络通识
  order: 13
description: 沿着连接复用、多路复用与丢包阻塞比较 HTTP/1.1、HTTP/2、HTTP/3，用明确的概念模型解释 QUIC 的优势及共享约束。
---

一个页面包含 HTML、CSS、脚本和几十张图片。即使每个资源都不大，也可能出现“明明有很多请求，却总有一部分在等”的现象。HTTP 的演进，很大程度上是在重新安排这些等待。

版本号越大，不代表每个网站都必然更快。应该先问：**请求在什么地方排队，哪些资源共享一个交付顺序，丢包会阻挡谁？** 这样才能理解多路复用和 QUIC，而不是把它们简化成“更多并发”和“改用 UDP”。

[Cloudflare 的 QUIC v1 发布文章](https://blog.cloudflare.com/quic-version-1-is-live-on-cloudflare/)是观察工程演进的入口；下面的协议比较以正式规范为准，所有时间数字都来自本文的教学模型，不是某家浏览器的实测成绩。

## Table of contents

## HTTP/1.1：复用连接，还需要安排响应顺序

上一讲介绍过持久连接。它能让多个请求复用已建立的 TCP 连接，减少重复建连成本，但不自动获得独立的并行响应流。

HTTP/1.1 管线化允许客户端在前一响应完成前发送后续请求，不过响应仍需按对应顺序发送。一个前面的慢响应，会延迟后面已经准备好的响应。浏览器历史上更多通过建立多个连接来获得并发，实际连接数量属于实现策略，不能写成所有浏览器永远固定的常数。

多个连接能够分散等待，但也增加握手、状态与竞争。同一站点资源拆成很多域名曾被用于绕过并发限制；到了新的协议环境，这种旧优化可能反而破坏连接复用，不能不看条件照搬。

## HTTP/2：把消息拆成帧，交错放进一条连接

HTTP/2 引入二进制分帧和流。请求与响应被组织进带有流标识的帧，不同流的帧可以交错发送，接收端再按流归组。一个大的图片响应不必在 HTTP 层独占整条连接直到全部发送完。

HTTP/2 还使用 HPACK 压缩字段，减少许多请求中重复的元信息；它也定义了流控制等机制。这里的“流”是 HTTP/2 的逻辑流，不是每条流都有一条独立 TCP 连接。[RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html)给出了完整定义。

关键限制在下一层：所有这些帧通常仍承载于同一条 TCP 有序字节流。若前面的 TCP 字节缺失，后面的字节即使已经到达，也不能绕过空洞交给 HTTP/2 解析器。受到影响的可能是多个 HTTP 流。

因此，HTTP/2 解决了 HTTP/1.1 响应排列中的一部分阻塞，但没有取消 TCP 的有序交付要求。

## HTTP/3：把多个独立流交给 QUIC

HTTP/3 把 HTTP 语义映射到 QUIC。QUIC 运行在 UDP 之上，自己提供可靠流、损失恢复、流量控制、拥塞控制，并结合 TLS 1.3 建立加密与认证。

UDP 在这里提供一个承载入口，不是让 HTTP 放弃可靠性。普通 HTTP/3 请求和响应仍使用可靠的 QUIC 流；协议另外支持的数据报扩展也不能与这种基本语义混为一谈。

QUIC 的一个重要差异是：不同流拥有独立的有序交付范围。某个流缺少一段数据，不必因为同一个连接中的统一字节顺序，把其他已具备交付条件的流一起挡住。HTTP/3 的流映射见 [RFC 9114](https://www.rfc-editor.org/rfc/rfc9114.html)。

![HTTP/2 的多个逻辑流共享 TCP 字节顺序；HTTP/3 的 QUIC 流可以独立交付，但仍共享连接资源。](../../assets/images/network-basics/13-http-evolution.svg)

## “没有队头阻塞”为什么说得太满？

QUIC 避免的是 TCP 那种跨流的有序字节交付阻塞，不是消除所有依赖和等待。

- 同一 QUIC 流内部仍需按序交付，自己的空洞仍然会阻塞自己。
- 多个流共享路径、连接资源和拥塞控制；丢包导致发送机会缩小时，其他流也可能受到性能影响。
- 一个丢失的 QUIC 包可能同时携带多个流的数据，相关流都会缺失内容。
- HTTP/3 的 QPACK 字段压缩存在受控的解码依赖，应用资源之间也可能有前置依赖。

例如 HTML 还没下载和解析，就不知道某个脚本 URL；这不是更换传输协议就能消除的等待。解释页面加载时，协议层与应用依赖图需要一起看。

## 动手：只模拟“交付顺序”这一件事

下面模型假设原始传输排列为 A0、B0、A1、B1，其中 A0 直到 80 ms 才被恢复，其他块更早到达。数字是人为设定的，并非测量。

```python
# 原始排列：(逻辑流, 块名称, 数据完整到达时间 ms)
blocks = [("A", "A0", 80), ("B", "B0", 20),
          ("A", "A1", 30), ("B", "B1", 40)]

ordered_delivery = {}
ready = 0
for stream, name, arrived in blocks:
    ready = max(ready, arrived)
    ordered_delivery[name] = ready

independent_delivery = {}
stream_ready = {}
for stream, name, arrived in blocks:
    ready = max(stream_ready.get(stream, 0), arrived)
    stream_ready[stream] = ready
    independent_delivery[name] = ready

for name in ["B0", "B1"]:
    print(name, "one ordered stream:", ordered_delivery[name],
          "independent streams:", independent_delivery[name])
```

输出为：

```text
B0 one ordered stream: 80 independent streams: 20
B1 one ordered stream: 80 independent streams: 40
```

A1 在两种模型中都要等 A0；B 在独立流模型中则不需要等 A 的空洞。这个模型只说明有序交付范围改变后可能出现的差异。

它没有模拟报文封装、拥塞窗口、重传调度、加密、字段压缩或浏览器渲染，**不能把 80/20 的比值当成 HTTP/3 比 HTTP/2 快四倍的证据**。真实比较必须使用相同内容、路径、缓存与连接状态，并记录损失和时延条件。

## 握手与连接迁移还带来了什么？

QUIC 将传输与 TLS 握手更紧密地结合，减少传统 TCP 与 TLS 分步建立时的部分等待；恢复连接在满足条件时还可以使用早期数据。0-RTT 仍有重放等限制，也不是每次访问都能使用。

QUIC 使用连接 ID 帮助识别连接，避免完全依赖一个永远不变的地址四元组。客户端从 Wi-Fi 切到蜂窝网络时，在实现支持、策略允许且路径验证成功的条件下，有机会维持逻辑连接。

这不意味着任意 IP 变化都无缝成功，也不意味着新路径容量与旧路径相同。路径验证、抗放大限制和拥塞状态都需要正确处理，相关设计见 [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html)。

## 在浏览器中确认实际使用的协议

打开开发者工具的 Network 面板，显示 Protocol 列，再重新加载页面。可能看到 `http/1.1`、`h2` 或 `h3`，具体列名和显示随浏览器版本变化。操作方式可查 [Chrome DevTools 文档](https://developer.chrome.com/docs/devtools/network/reference/)。

第一次与后续访问可能不同：服务器可通过 Alt-Svc 等机制告知其他服务入口，客户端也可能已有缓存信息；现代发现机制不只一种。UDP 被网络策略阻断时，客户端可能回退到基于 TCP 的协议。

若使用 curl，先执行 `curl --version` 查看本机构建支持哪些特性，再使用相应选项。一个 curl 不认识 `--http3`，只能说明该构建没有这个能力，不能据此认定网站不支持 HTTP/3。强制一种协议后失败，与默认模式成功回退也是不同结果。

## 选择协议，不要只比较版本号

大文件稳定传输、短小 API、高损失移动网络和低时延局域网，收益来源可能不同。服务器实现、CPU 开销、缓存命中、优先级和应用依赖，也会影响最终体验。

测试时至少记录目标 URL、实际协议、是否新连接、缓存状态、对象大小、总耗时和首字节时间。新连接的 HTTP/3 与复用连接的 HTTP/2，或热缓存与冷缓存，不能直接当成公平的协议对照。

把协议演进理解成“改变等待发生的位置”，比把 HTTP/3 当作万能加速开关更有用。

上一篇：[HTTPS 与 TLS](/blog/posts/how-https-and-tls-establish-trust/)

下一篇：[代理、负载均衡和 CDN](/blog/posts/understanding-proxies-load-balancers-and-cdns/)

## 参考与延伸阅读

- [Cloudflare：QUIC Version 1 is live](https://blog.cloudflare.com/quic-version-1-is-live-on-cloudflare/)——QUIC v1 的工程背景。
- [RFC 9113](https://www.rfc-editor.org/rfc/rfc9113.html)、[RFC 9114](https://www.rfc-editor.org/rfc/rfc9114.html)——HTTP/2 与 HTTP/3。
- [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html)、[RFC 9001](https://www.rfc-editor.org/rfc/rfc9001.html)、[RFC 9002](https://www.rfc-editor.org/rfc/rfc9002.html)——QUIC 传输、TLS 与恢复控制。
- [Chrome Network 面板](https://developer.chrome.com/docs/devtools/network/reference/)——核对浏览器实际连接行为。
