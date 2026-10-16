---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
title: IPv6 带来的变化，为什么不只是地址变长？
featured: false
draft: false
ogImage: ../../assets/images/network-basics/16-ipv6-networking-og.png
tags:
  - 计算机网络
  - IPv6协议
  - 邻居发现
series:
  name: 计算机网络通识
  order: 16
description: 从 IPv6 地址写法进入邻居发现、路由通告、SLAAC 和双栈，解释默认路由、ICMPv6、防火墙与端到端可达性的边界。
---

打开网络配置，看到一长串带冒号的地址，还看到同一个网卡拥有多个 IPv6 地址：有的以 `fe80` 开头，有的会随时间变化。IPv6 只是把 IPv4 的四段数字拉长了吗？

地址空间扩大是显著变化，但主机发现邻居、获得前缀、建立默认路由和处理路径 MTU 的方式也不同。**迁移到 IPv6，需要重新检查配置和可达性，不能只把 IPv4 地址字符串替换掉。**

[Cloudflare 关于双栈代理的文章](https://blog.cloudflare.com/always-on-ipv6/)说明了一个有用场景：访客到边缘、边缘到源站可以使用不同 IP 版本。那篇文章的产品决策具有历史背景；本文关注其中能帮助理解的连接边界，以及 IPv6 的基础机制。

## Table of contents

## 先读懂一个 IPv6 地址

IPv6 地址长 128 位，常用八组十六进制数表示，每组 16 位。例如下面两种写法表示相同地址：

```text
2001:0db8:1234:5678:0000:0000:0000:0034
2001:db8:1234:5678::34
```

每组前导零可以省略，一段连续的全零组可以用 `::` 压缩；一份地址中只能使用一次 `::`，否则无法知道省略位置各有多少组。

如果要在 URL 中写字面 IPv6 地址，需要方括号区分地址与端口，例如 `https://[2001:db8::34]:8443/`。这里使用的是文档地址，不是建议访问的真实服务。

`/64` 仍是前缀长度，表示前 64 位属于该前缀。常见以太网 SLAAC 子网使用 `/64`，但不能由此声称所有 IPv6 路由或所有链路都只能用 `/64`。IPv6 的前缀长度同样可以表达汇总路由和其他用途。

## 一个接口为什么会有多个地址？

| 例子或范围   | 常见用途         | 要记住的边界                                      |
| :----------- | :--------------- | :------------------------------------------------ |
| `::1`        | 本机回环         | 不代表另一台设备                                  |
| `fe80::/10`  | 链路本地地址范围 | 只能用于相应链路，需要辨认接口作用域              |
| `fc00::/7`   | 唯一本地地址范围 | 常见本地分配使用 `fd00::/8`，通常不在全球公网路由 |
| 全球单播地址 | 跨网络路由       | 拥有地址不等于入站策略允许                        |
| `ff00::/8`   | 组播             | 是给一组接收者的通信方式                          |

同一个接口可以同时拥有链路本地、稳定地址和临时地址。临时地址用于降低长期关联某个接口的便利性，但不等于全面匿名；应用最终选哪个源地址还受到目标、路由和地址选择规则影响。

链路本地地址在不同接口上可能出现相同文字形式，因此工具常需要类似 `%接口编号` 的作用域信息。接口编号依操作系统和机器而变，不能从教程复制一个数字就保证可用。

## 没有 ARP，怎样找到本地下一跳？

IPv6 不使用 IPv4 的 ARP。邻居发现 ND 基于 ICMPv6，涵盖邻居链路层地址解析、邻居可达性、路由器发现等相关工作。

主机可以用 Neighbor Solicitation 与 Neighbor Advertisement 进行邻居解析。在以太网等链路上，相关组播机制避免把每次解析简单做成 IPv4 ARP 那样的全网广播。IPv6 没有 IPv4 式广播地址，但仍有组播和其他控制通信，不能理解成局域网再无发现流量。

![IPv6 主机通过路由通告获得前缀与默认路由信息，用邻居发现解析下一跳；IPv4 与 IPv6 路径分别验证。](../../assets/images/network-basics/16-ipv6-networking.svg)

[邻居发现 RFC 4861](https://www.rfc-editor.org/rfc/rfc4861.html)覆盖的范围比“IPv6 版 ARP”更大。把它简化成一个地址转换协议，会遗漏路由器发现和可达性检测这些重要职责。

## 自动配置：地址、默认路由和 DNS 不必来自同一处

路由器通过 Router Advertisement 通告相关信息。主机在满足条件时，可以结合可用于自主配置的前缀形成地址，这就是 SLAAC 的核心路径。形成地址后通常还需要进行重复地址检测；检测有协议假设，并不构成永远不会冲突的数学证明。

默认路由通常来自路由器通告及其寿命信息。不要按 IPv4 DHCP 的习惯推断“使用 DHCPv6，就一定从它获得默认网关”。DHCPv6 可以参与地址或其他配置分发，DNS 信息也可以来自 RA 或 DHCPv6 等机制，具体组合取决于网络配置和主机支持。

SLAAC 也不等于“后半部分永远从 MAC 地址推出来”。现代实现可以使用稳定但不直接暴露 MAC 的标识或临时地址机制；应以当前系统实际配置为准。

前缀还有首选与有效寿命等概念。地址可以进入不再优先用于新连接、但尚未立即失效的阶段。这帮助网络重新编号，不能把每个地址的存在都理解成永久固定。基础流程见 [RFC 4862](https://www.rfc-editor.org/rfc/rfc4862.html)。

## 报文头与分片也发生了变化

IPv6 基本首部固定为 40 字节，某些可选信息放入扩展首部。基本首部没有 IPv4 首部校验和；这不代表数据完全不受其他层的差错检测保护。

中间路由器不会像 IPv4 某些场景那样为转发数据包执行分片。发送端需要尊重路径 MTU，必要时由源端处理分片或调整发送策略；ICMPv6 Packet Too Big 在路径 MTU 发现中很重要。

因此，把所有 ICMPv6 一律丢弃，可能破坏邻居发现、配置和路径适应。正确做法是根据实际角色与规范设计过滤规则，而不是把 ICMPv6 只当成可有可无的 ping。相关基础规则见 [RFC 8200](https://www.rfc-editor.org/rfc/rfc8200.html)。

## 动手：地址压缩和前缀判断

下面程序只做离线地址运算，不验证任何真实 IPv6 网络是否连通。

```python
import ipaddress

address = ipaddress.IPv6Address("2001:0db8:1234:5678:0:0:0:0034")
network = ipaddress.IPv6Network("2001:db8:1234:5678::/64")
print("compressed:", address.compressed)
print("expanded:", address.exploded)
print("in prefix:", address in network)
print("another prefix:", ipaddress.IPv6Address("2001:db8:1234:5679::1") in network)
print("link local:", ipaddress.IPv6Address("fe80::1").is_link_local)
```

预期输出：

```text
compressed: 2001:db8:1234:5678::34
expanded: 2001:0db8:1234:5678:0000:0000:0000:0034
in prefix: True
another prefix: False
link local: True
```

不要把 `/64` 的全部地址展开成列表。前缀数学包含数量极大的地址；“知道一个地址是否属于前缀”只需要位运算，不需要枚举。

这也不能直接推出实际下一跳。与 IPv4 一样，真正选路仍需查询路由表及相关策略。属于某前缀和操作系统当前把它视为 on-link，是需要结合配置区分的问题。

## 双栈为什么有时掩盖 IPv6 故障？

一个域名可以同时有 A 和 AAAA 记录，客户端也可能同时具备 IPv4 与 IPv6。应用可采用 Happy Eyeballs 类策略，让不同地址候选的连接尝试有节奏地竞争，降低某条路径故障带来的长等待。[RFC 8305](https://www.rfc-editor.org/rfc/rfc8305.html)描述了这类策略。

结果是：网站能打开，不代表两条路径都健康。浏览器可能迅速回退到 IPv4，而某个只用 IPv6 的程序仍然失败。反过来，IPv6 成功也不能证明 IPv4 配置正确。

在自己的环境可以分别观察：

```powershell
Get-NetIPAddress -AddressFamily IPv6
Get-NetRoute -AddressFamily IPv6
Resolve-DnsName example.com -Type AAAA
```

Linux 对应的基础观察包括 `ip -6 addr`、`ip -6 route`。如果 curl 构建支持，可以用 `curl -4` 与 `curl -6` 比较同一站点；结果还受目标是否提供相应地址、代理和本地路径影响。本文不预设你的网络一定具备 IPv6 外网能力。

## IPv6 可路由，不代表所有服务都开放

IPv6 使许多场景不再需要为了节约地址而部署 NAPT，但 NAT 本来就不是访问控制的唯一方式。有状态防火墙仍可允许出站及相关回应、拒绝未授权入站；主机也仍需正确监听、认证和更新。

[RFC 6092](https://www.rfc-editor.org/rfc/rfc6092.html)讨论了住宅 IPv6 网关的基本安全能力。它帮助说明：保留访问控制并不要求把地址转换当成前提。

理解 IPv6 后，再看后面的 VPN、Tailscale 和 NAT 穿透三篇，就可以区分哪些机制在解决寻址不足，哪些在解决策略、身份和跨网络连接。地址变长只是这张地图中的一部分。

上一篇：[NAT 与外网访问](/blog/posts/why-inbound-connections-fail-behind-nat/)

下一篇：[VPN 的底层原理](/blog/posts/what-is-a-vpn/)

## 参考与延伸阅读

- [Cloudflare：Less Is More — Why The IPv6 Switch Is Missing](https://blog.cloudflare.com/always-on-ipv6/)——双栈代理的历史工程场景。
- [RFC 8200](https://www.rfc-editor.org/rfc/rfc8200.html)——IPv6 基础协议。
- [RFC 4861](https://www.rfc-editor.org/rfc/rfc4861.html)、[RFC 4862](https://www.rfc-editor.org/rfc/rfc4862.html)——邻居发现与无状态地址配置。
- [RFC 8305](https://www.rfc-editor.org/rfc/rfc8305.html)——双栈连接选择。
- [RFC 6092](https://www.rfc-editor.org/rfc/rfc6092.html)——住宅 IPv6 网关过滤能力。
