---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
title: 端口和 Socket：网络怎样找到你的程序？
featured: false
draft: false
ogImage: ../../assets/images/network-basics/06-ports-and-sockets-og.png
tags:
  - 计算机网络
  - 套接字编程
  - 传输层协议
series:
  name: 计算机网络通识
  order: 6
description: 从一台电脑上的多个联网程序出发，理解端口、Socket 与 UDP 数据报，并用只在本机运行的 Python 程序观察收发端点。
---

浏览器正在加载网页，聊天软件正在收消息，后台程序也在上传文件。它们可能共用一个网卡、一个本地 IP 地址。数据到达电脑以后，操作系统怎么知道应该交给谁？

前五篇解决了主机之间的寻址与转发。这一篇把镜头推进主机内部：**IP 把数据带到网络端点，传输层和操作系统继续把数据交给合适的 Socket。** 这里的 Socket 通常译作“套接字”，可以先把它理解成程序申请的通信对象。

[Beej 的网络编程指南](https://beej.us/guide/bgnet/html/split/what-is-a-socket.html)从程序员的视角介绍这个对象。下面使用自拟的回环实验，把地址、端口、收发接口分别看清；不需要另一台电脑，也不需要开放路由器端口。

## Table of contents

## 一个 IP，为什么还要配一个端口？

假设电脑的 IPv4 地址是 `192.168.10.20`。浏览器访问网页时，某条连接的端点可能是：

```text
本地：192.168.10.20:53024
远端：203.0.113.80:443
传输协议：TCP
```

这些地址只是文档示例。冒号后面的数字是端口，不是网卡上的物理插孔。TCP 和 UDP 首部中都有 16 位端口字段，可以表达 `0` 到 `65535`；但“字段能表达”不等于每个数字都适合给普通应用绑定。端口 0 在绑定 API 中常被用来请求操作系统分配可用端口。

目的端口回答“希望访问哪个传输层服务端点”，源端口则使对方能够把回复发回来。HTTPS 常使用 TCP 443，不过端口只是惯例和配置：在 8443 上也可以部署 HTTPS，在 443 上也不能仅凭数字断定收到的内容一定合法。

| 看到的字段 | 能帮助回答的问题           | 不能单独证明的事     |
| :--------- | :------------------------- | :------------------- |
| 目的 IP    | 数据送往哪个网络地址       | 具体由哪个进程处理   |
| 目的端口   | 在该传输协议下寻找哪个端点 | 程序身份、用户身份   |
| TCP / UDP  | 采用哪种传输语义与端口空间 | 应用层协议一定是什么 |
| 应用消息   | 请求什么资源或操作         | 对方是否已经完成业务 |

TCP 443 和 UDP 443 属于不同的协议空间。HTTP/3 常使用 UDP 443，它与 TCP 上的 HTTPS 并不互相“抢同一个端口”。

## Socket 是对象，不是一个端口的别名

程序调用 `socket()` 创建对象，再通过它请求操作系统收发数据。这个对象还保存协议类型、绑定地址、状态、缓冲区和各种选项。进程中的文件描述符或 Python 对象，是程序访问它的句柄。

因此，下面几组概念不能简单画等号：

- 进程不等于端口：一个进程可以持有许多 Socket。
- Socket 不等于 TCP 连接：UDP Socket 也存在，监听 Socket 也没有对应某一条已建立连接。
- 端口不等于唯一进程：共享监听、继承句柄和端口复用受操作系统规则与选项影响。

理解程序时，应该追踪“谁持有哪个 Socket、它绑定了什么地址、处于什么状态”，而不是只问“哪个程序占了这个数字”。

![IP、协议与端口把报文交到相应 Socket；TCP 与 UDP 使用不同的端口空间。](../../assets/images/network-basics/06-ports-and-sockets.svg)

## bind、connect 和 listen 分别做什么？

这几个名字看起来都像“建立连接”，实际职责不同。

`bind()` 指定本地端点。绑定 `127.0.0.1` 表示仅使用 IPv4 回环地址；绑定 `0.0.0.0` 是监听所有适用的本地 IPv4 地址的通配方式，**不是让客户端把数据发往 0.0.0.0**。网络是否能访问到服务，还取决于路由、防火墙等条件。

对于 TCP，`listen()` 把 Socket 置于被动监听状态；客户端 `connect()` 发起连接；服务器 `accept()` 取出一个已建立连接，得到另一个 Socket。原监听对象继续接待后续连接。

对于 UDP，通常不需要 `listen()` 或 `accept()`。`sendto()` 指明本次数据报的目标，`recvfrom()` 同时返回内容和来源端点。UDP 也能调用 `connect()`，但这主要是设置默认对端和关联收发行为，不会因此出现 TCP 的三次握手或可靠字节流。

[Python socket 文档](https://docs.python.org/3/library/socket.html)描述了这些接口；底层行为仍受操作系统影响。客户端不显式 `bind()` 时，系统通常会在发送或连接过程中选择合适的本地地址和临时端口。

## UDP 保留消息边界，但不保证送达

假设程序分别发送 `cat` 和 `elephant` 两个 UDP 数据报。接收方使用足够大的缓冲区时，会按数据报读取，而不是自动把它们拼成 `catelephant`。

这个边界很有用，但 UDP 本身不提供重传、顺序交付和重复消除。如果只收到了第二条，应用不能认为第一条“肯定在路上”。接收缓冲区过小也不能指望下一次调用接着读剩余半条：可能截断或报错，具体表现依平台和接口而异。

[UDP 规范 RFC 768](https://www.rfc-editor.org/rfc/rfc768.html)定义了这种较小的传输层机制。需要可靠交付的应用，可以在 UDP 上另外设计确认、重传、拥塞控制和加密；QUIC 就是一套远比“裸 UDP”丰富的协议。不能据此把“UDP 不可靠”误读为“使用 UDP 的应用必然不可靠”。

对应用开发者而言，真正的问题是：**缺少的语义由谁提供，代价由谁承担？** 游戏中的过期位置更新可能宁愿丢弃，文件传输中的缺失字节则必须补齐。两者的目标不同。

## 动手：在本机交换一个 UDP 数据报

把下面代码保存为 `udp_loopback.py`，使用 Python 3 执行。两个 Socket 都只绑定本机回环地址，端口由系统分配。这里把收发双方写进同一进程，方便观察；它们仍通过操作系统的 UDP 接口通信。

```python
import socket

with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as server:
    server.bind(("127.0.0.1", 0))
    server.settimeout(2)

    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as client:
        client.bind(("127.0.0.1", 0))
        client.settimeout(2)
        destination = server.getsockname()
        client.sendto(b"hello", destination)

        payload, peer = server.recvfrom(1024)
        print("server received:", payload)
        print("source matches client:", peer == client.getsockname())
        server.sendto(payload.upper(), peer)

        reply, source = client.recvfrom(1024)
        print("client received:", reply)
        print("reply source matches server:", source == destination)
```

输出应为：

```text
server received: b'hello'
source matches client: True
client received: b'HELLO'
reply source matches server: True
```

这里验证了四件事：系统可以分配端口；一个程序可以同时持有多个 Socket；接收接口能告诉我们对端地址；回复要发给收到的数据报所携带的来源端点。

这个实验没有制造丢包，也没有跨越网卡、交换机或 NAT。一次本机成功通信不构成 UDP 可靠性的证据。`settimeout(2)` 只是防止示例无限等待，不会让内核替 UDP 补发数据。

还可以把 `b"hello"` 改成 `b""`：零长度 UDP 数据报是合法消息。不要照搬 TCP 中“`recv()` 返回空字节串表示读到 EOF”的规则来理解 UDP。

## 为什么浏览器可以同时连接同一个服务器？

浏览器可以创建多条连接，操作系统为它们分配不同的本地端点。即便远端都是 `203.0.113.80:443`，本地端口也可能不同。对于普通 TCP 连接，在同一网络上下文中，源 IP、源端口、目的 IP、目的端口共同区分连接；把协议一起写出来，就是常见的五元组表达。

服务器不必为每个客户端开放一个全新的监听端口。监听 443 的服务接受连接后，可以得到许多本地端口仍为 443、远端端点各不相同的连接 Socket。这正是下一篇需要拆开的“监听”和“连接”。

若程序提示地址已被占用，先确认发生在 `bind()`、`connect()` 还是其他调用，检查具体本地地址、协议和复用选项。仅凭“443 被用了”不足以解释完整原因。

## 留一个检查理解的问题

一台机器上存在一个 UDP 9000 服务和一个 TCP 9000 服务，为什么不一定冲突？如果 UDP 客户端没有收到回复，能否直接判断服务器程序已经退出？

前者要从协议空间区分；后者需要继续考虑数据报丢失、地址写错、服务处理失败、接收超时等可能性。端口帮助找到入口，但入口之后仍有一整条处理链。

上一篇：[DNS 怎样工作](/blog/posts/how-dns-resolution-works/)

下一篇：[TCP 为什么要三次握手](/blog/posts/why-tcp-needs-a-three-way-handshake/)

## 参考与延伸阅读

- [Beej：What is a socket?](https://beej.us/guide/bgnet/html/split/what-is-a-socket.html)——从程序接口理解套接字。
- [Python：socket](https://docs.python.org/3/library/socket.html)——本文使用的 API 与跨平台边界。
- [RFC 768](https://www.rfc-editor.org/rfc/rfc768.html)——UDP 的报文格式和基本语义。
