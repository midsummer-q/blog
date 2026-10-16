---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
title: 打开一个网页，网络世界发生了什么？
featured: false
draft: false
ogImage: ../../assets/images/network-basics/01-web-request-map-og.png
tags:
  - 计算机网络
  - 网络协议
  - 网络分层
  - 浏览器网络
series:
  name: 计算机网络通识
  order: 1
description: 从输入网址到看到页面，沿着 DNS、TCP、TLS、HTTP 与逐跳转发建立网络知识地图，并用浏览器和 curl 观察一次真实请求。
---

打开网页只需要按一次回车，排查网页打不开却可能面对一串完全不同的错误：域名解析失败、连接超时、证书不匹配、HTTP 404。它们都发生在“上网”过程中，为什么处理方法差别这么大？

因为一次网页访问需要几组不同的机制共同完成。把这些机制的职责分开，才能知道错误发生在哪里，也才能理解后续文章中的 IP、端口、路由和握手。

[Cloudflare 的互联网入门文章](https://www.cloudflare.com/learning/network-layer/how-does-the-internet-work/)用网页访问串联基础协议；[Practical Networking 的 Packet Traveling 系列](https://www.practicalnetworking.net/series/packet-traveling/packet-traveling/)则沿数据包经过的设备逐步解释通信。本文借鉴这两种观察角度，用一个自拟场景建立本专栏的第一张地图。

> [!NOTE] 本文的观察范围
> 主线先假设：浏览器直接连接一个 HTTPS 站点，使用 HTTP/1.1 over TCP，需要新建连接，相关缓存未命中。图中的地址是教学示例，不代表某个网站的实际部署。HTTP/2、HTTP/3、缓存、代理和 CDN 带来的变化，会在后文单独说明。

## Table of contents

## 先把一个网址拆开

考虑这个网址：

```text
https://www.example.com/articles/network?lang=zh#tcp
└─协议  └────主机名────┘└──────路径─────┘└查询┘└片段
```

浏览器不会把这一整串文字直接交给 DNS。

| 部分                | 在本次访问中的用途                                         |
| :------------------ | :--------------------------------------------------------- |
| `https`             | 选择使用安全的 HTTP 通信；没有显式端口时默认端口为 443     |
| `www.example.com`   | 标识要访问的主机名，需要获得可连接的地址                   |
| `/articles/network` | 告诉 HTTP 服务要请求哪个资源                               |
| `?lang=zh`          | 作为查询字符串交给服务端处理                               |
| `#tcp`              | 通常由浏览器定位页面片段，不包含在发送给服务端的请求目标中 |

URL 的这几部分承担不同职责：[MDN 的 URL 说明](https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_URL)分别介绍了协议、主机、端口、路径、查询和片段。这里最值得记住的是：**域名用于寻找服务入口，路径用于请求入口后面的资源。**

同一个域名可以解析出多个地址；同一个 IP 地址也可以承载多个网站。把“域名”“IP”“网页”当成一一对应的关系，后面遇到负载均衡和虚拟主机就会困惑。

## 第一步：拿到可以连接的地址

浏览器可能先利用已有的解析结果，也可能通过系统解析服务或自己的 DNS 机制发起查询。我们暂时只关心查询的目标：获取主机名对应的 IPv4 或 IPv6 地址。

假设本次得到一个示意地址 `203.0.113.80`，浏览器便拥有了一个候选通信端点：

```text
服务地址：203.0.113.80
服务端口：443
```

这还不能说明网站一定能打开。地址可能不可达，443 端口可能没有服务，也可能在后面的证书校验或 HTTP 处理中失败。

DNS 自己也需要网络通信。这里把 DNS 写在 TCP 前面，是按照“先获得服务地址，再连接该服务”的依赖关系叙述；DNS 查询本身同样要经过网络接口、路由器和相应的传输协议。

我们将在[第 5 篇：DNS 解析](/blog/posts/how-dns-resolution-works/)里展开解析器、根服务器、权威服务器和缓存之间的关系。

## 第二步：知道目的地之后，先决定交给谁

假设电脑的 IPv4 地址是 `192.168.10.20/24`，默认网关是 `192.168.10.1`。目标地址 `203.0.113.80` 不属于这个本地子网。

操作系统查询路由表，选择出接口和下一跳。在这个简化场景中，下一跳就是默认网关。接下来，如果使用以太网且邻居缓存没有对应记录，主机需要通过 ARP 获得网关接口的 MAC 地址，才能构造发往这一跳的以太网帧。

注意这里的两个目的地：

```text
IP 层的目的地：203.0.113.80 —— 我要与哪个远端端点通信
本地帧的目的地：网关的 MAC —— 这一跳先把数据交给谁
```

主机不需要事先知道远端服务器的 MAC 地址，也不需要掌握沿途每个路由器的完整清单。它只要根据本地转发表选好下一跳；后续路由器再各自做下一次选择。

家庭网络通常还有 NAT，进入互联网时源地址可能被转换。这个变化不影响我们先建立“远端目的地”和“当前下一跳”两个概念，NAT 会在后面的专题中展开。

![网页访问的控制步骤与业务数据路径：DNS 提供地址，网页数据经本地网络和路由器到达 HTTPS 服务](../../assets/images/network-basics/01-web-request-map.svg)

_图为原创示意。DNS 解析器提供地址信息，不是网页正文必须经过的中转站。_

## 第三步：TCP 建立一条可用的字节流

浏览器通过操作系统创建连接，本地通常分配一个临时端口，例如 `53124`。在源地址尚未被 NAT 改写的观察位置，这条 TCP 连接可以用四元组描述：

```text
192.168.10.20:53124 → 203.0.113.80:443
```

新连接通常先经历三次握手：

```text
客户端                         服务端
   | ---------- SYN ----------> |
   | <------- SYN + ACK -------- |
   | ---------- ACK ----------> |
```

握手让双方建立连接状态，并同步后续通信所需的初始序列号等信息。TCP 随后提供的是 **可靠、有序的字节流**；应用程序不需要自行把收到的乱序 TCP 数据重新排好，但仍然必须处理连接中断、读写错误和超时。

[RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html)给出了 TCP 的规范。对于刚开始学习的读者，先抓住一个边界：TCP 负责字节传送，不理解 HTML、HTTP 状态码，也不会替应用程序判断“这次业务已经成功”。

此外，一次 `send()` 并不承诺在对端对应一次 `recv()`。应用协议需要自己规定消息边界。这个问题会在 TCP 专题里通过小程序演示。

## 第四步：TLS 验证身份，并保护连接中的数据

建立 TCP 连接不等于已经建立安全连接。HTTPS 还需要 TLS。

以现代 TLS 1.3 的常见证书认证流程为例，客户端与服务端协商参数、完成密钥交换，服务端证明自己拥有与证书关联的私钥。浏览器检查证书链、有效期和主机名等条件；满足要求后，双方使用协商出的密钥保护应用数据。[RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html)定义了 TLS 1.3。

可以用三个问题理解这一步：

- **身份**：连接的对方是否有权代表这个域名？
- **机密性**：旁路观察者能否直接读出 HTTP 内容？
- **完整性**：数据在传输途中被修改，接收方能否发现？

保护的边界是 TLS 的两个端点。如果浏览器连接的是 CDN 边缘节点，浏览器这一段 TLS 就终止在该节点；边缘节点到源站的连接，需要另外考察。

HTTPS 也不会让所有网络信息消失。通信地址、流量大小和时序仍可能被观察；DNS 是否加密是另一个问题。判断“谁看得到什么”，必须先标明观察位置。

## 第五步：HTTP 才开始表达“我要哪个网页”

握手完成后，浏览器才能在这条连接上发送受 TLS 保护的 HTTP 请求。在我们选定的 HTTP/1.1 场景中，请求解密后的逻辑形式大致如下：

```http
GET /articles/network?lang=zh HTTP/1.1
Host: www.example.com
Accept: text/html

```

这里没有 `#tcp`。路径和查询参数进入请求目标，主机名则由 `Host` 等机制帮助服务端识别请求的目标站点。

服务端可能直接读取一个静态文件，也可能让应用程序查询数据库后生成响应；还可能返回重定向或错误。比如：

```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 13

<h1>Hello</h1>
```

这是一段自拟的最小响应，正文恰好是 13 个 ASCII 字节。真实页面会有更多首部和更大的正文。

HTTP 定义请求、响应和资源操作的语义，具体规定可查阅 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)。这里可以立刻得到一个排障结论：**看到 HTTP 404，说明已经有 HTTP 服务给出了响应，不能简单归类为“网络完全不通”。** 这个响应也可能来自代理或边缘节点，仍需确认是谁返回的。

## 同一份内容，为什么会有这么多层包装？

在主线场景中，数据交给下层时，各层会附上完成自身任务所需的信息：

```text
HTTP 消息
  ↓ TLS 保护
TLS 记录中的密文
  ↓ TCP 传送字节
TCP 段
  ↓ IP 寻址与转发
IP 数据包
  ↓ 通过当前链路发送
以太网帧 → 物理介质上的信号
```

这是职责示意，不意味着“一条 HTTP 消息 = 一个 TLS 记录 = 一个 TCP 段 = 一个帧”。实际传输中，数据会被分段、合并或拆分，不同层的边界并不一一对应。

| 层次或机制 | 主要关心的问题             | 可以观察的线索       |
| :--------- | :------------------------- | :------------------- |
| HTTP       | 请求哪个资源，返回什么结果 | 方法、路径、状态码   |
| TLS        | 如何认证并保护通信         | 证书、握手、加密记录 |
| TCP        | 哪个连接，哪些字节已经收到 | 端口、序列号、确认号 |
| IP         | 目标地址是什么，往哪里转发 | IP 地址、路由、TTL   |
| 链路层     | 当前链路上交给哪个邻居     | MAC 地址、以太网帧   |

学习分层的价值，是把责任定位清楚。排查证书名称不匹配时，反复修改子网掩码通常无济于事；分析 DNS 超时时，也不能只盯着网页 JavaScript。

## 最后一步：收到字节，浏览器还要把它变成页面

HTML 到达后，浏览器解析文档，并按需请求样式、脚本、字体和图片。随着资源到达，它继续执行样式计算、布局与绘制。[MDN 的浏览器工作流程](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work)把导航、响应、解析和渲染分开讨论，适合在这一点上继续阅读。

浏览器可以在整个页面下载完之前开始解析和显示部分内容。反过来，网络请求都结束了，也不意味着页面一定已经流畅可用：主线程可能还在执行脚本。

所以“网页慢”至少可能指三种不同现象：连接建立慢、服务器迟迟不回首字节、数据到达后浏览器处理慢。把它们混在一起，很容易选错优化方向。

## 动手观察：把抽象过程放进时间轴

### 用浏览器看请求

在 Chrome 或 Edge 中打开开发者工具的 Network 面板，然后访问 `https://example.com/`：

1. 找到类型为 Document 的主文档请求，查看请求方法、状态码和远端地址。
2. 显示 Protocol 列，观察本次使用的是 HTTP/1.1、h2 还是 h3。
3. 打开 Timing，区分 DNS、连接、TLS、等待响应和下载阶段。
4. 再次刷新，对比哪些阶段缩短或没有单独显示。

Network 面板的字段和操作可对照 [Chrome DevTools 文档](https://developer.chrome.com/docs/devtools/network/reference)。阶段为空或显示为零，可能因为连接或解析结果被复用，不是协议突然不需要这些机制。

面板里的 Disable cache 主要用于关闭 HTTP 缓存，不能把它当成“清空所有 DNS 缓存、连接池和 TLS 会话”的按钮。

### 用 curl 看累计时间

Windows PowerShell：

```powershell
curl.exe --http1.1 -o NUL -sS --connect-timeout 10 --max-time 30 -w "dns=%{time_namelookup}s connect=%{time_connect}s tls=%{time_appconnect}s first_byte=%{time_starttransfer}s total=%{time_total}s\n" https://example.com/
```

Linux/macOS 使用同一命令时，将 `curl.exe` 改为 `curl`、`NUL` 改为 `/dev/null`。参数含义来自 [curl 手册](https://curl.se/docs/manpage.html)。

这些时间大多是从请求开始算起的 **累计时间**。下面只是用于练习阅读的示意结果，不是性能测试数据：

```text
dns=0.012s connect=0.040s tls=0.090s first_byte=0.140s total=0.145s
```

在一次简单、无代理、无重定向的新连接中，可以粗略拆成：

- DNS：`0.012 s`；
- 建立 TCP 的增量：`0.040 - 0.012 = 0.028 s`；
- TLS 的增量：`0.090 - 0.040 = 0.050 s`；
- TLS 完成至首字节：`0.140 - 0.090 = 0.050 s`。

最后一个差值包含请求传输、服务端处理和响应返回，不能直接称作“服务器计算耗时”。代理、连接复用和网络环境也会影响这些数值。

## 现实访问会走哪些分支？

现在可以给最初的主线加上几个分支，而不必推翻已经建立的模型：

- **命中 HTTP 缓存**：可能直接使用本地响应，也可能发起条件请求。
- **复用已有连接**：不一定再次执行完整的 TCP、TLS 握手。
- **使用 HTTP/2**：仍可在 TCP 与 TLS 上承载，但多个请求可以共享连接中的不同流。
- **使用 HTTP/3**：承载在 QUIC 上，通常通过 UDP 通信，不应再画成“先 TCP 三次握手”。QUIC 的基础定义见 [RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html)。
- **使用代理或 CDN**：浏览器实际连接的端点可能是代理或边缘节点，后面还存在另一段通信。

再遇到“从输入 URL 到页面显示发生了什么”这个问题，就可以先说明场景，再沿依赖关系讲清楚每一步，而不是背一条永远不变的流水线。

下一篇把范围收回到同一个局域网，研究其中最先要解决的事情：[两台电脑怎样找到彼此，并把帧交到对方手里？](/blog/posts/how-devices-communicate-on-a-lan/)

## 参考与延伸阅读

- [Cloudflare：How does the Internet work?](https://www.cloudflare.com/learning/network-layer/how-does-the-internet-work/)——互联网与网页访问的入门视角。
- [Practical Networking：Packet Traveling](https://www.practicalnetworking.net/series/packet-traveling/packet-traveling/)——沿数据包路径组织知识的系列。
- [MDN：What is a URL?](https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_URL) 与 [How browsers work](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work)——URL 结构及浏览器处理过程。
- [RFC 9293：TCP](https://www.rfc-editor.org/rfc/rfc9293.html)、[RFC 8446：TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446.html)、[RFC 9110：HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)、[RFC 9000：QUIC](https://www.rfc-editor.org/rfc/rfc9000.html)——对应协议的规范依据。
- [Chrome DevTools Network](https://developer.chrome.com/docs/devtools/network/reference) 与 [curl 手册](https://curl.se/docs/manpage.html)——动手观察时的工具说明。
