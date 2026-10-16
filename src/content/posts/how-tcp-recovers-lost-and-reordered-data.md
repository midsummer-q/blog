---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
title: 数据包丢了、乱序了，TCP 怎样恢复？
featured: false
draft: false
ogImage: ../../assets/images/network-basics/08-tcp-recovery-og.png
tags:
  - 计算机网络
  - 传输控制协议
  - 网络可靠性
series:
  name: 计算机网络通识
  order: 8
description: 从一段缺失的字节解释累积 ACK、重传与 SACK，再用分块输入实验理解 TCP 字节流为什么需要应用层消息边界。
---

你把一张图片交给 TCP 发送，途中一个数据包丢了，另一个却提前到达。接收程序为什么通常仍能得到顺序正确的图片？

TCP 的关键做法是给数据编号、记住确认进度，并在必要时重新发送缺失内容。不过，编号的基本对象是**字节**，不是应用调用 `send()` 的次数，也不是抓包列表中的行号。

这一篇使用自拟的字节区间追踪丢失与恢复，然后写一个应用消息解析器。前半部分讨论传输层如何交付有序字节，后半部分讨论程序如何从字节中辨认一条条消息；它们解决的是两个问题。

## Table of contents

## 序列号在数什么？

假设握手已经结束，发送方下一字节的序列号为 1001。它准备发送 3000 字节，为了画图方便，分成三段：

| 段  | 字节区间，左闭右开 | 长度 |
| :-- | :----------------- | ---: |
| A   | [1001, 2001)       | 1000 |
| B   | [2001, 3001)       | 1000 |
| C   | [3001, 4001)       | 1000 |

这里的分段大小仅是教学选择。实际边界受 MSS、路径、发送时机与实现影响。重传时也不必沿用最初一模一样的数据包边界。

如果 A 连续收到，接收方可以确认 `ACK=2001`，表示接下来期待 2001 开始的字节。如果 B 丢了、C 先到了，C 并不能填补前面的空洞，连续确认点仍然停在 2001。

![B 段丢失后，累积 ACK 停在空洞前；SACK 指出已经收到的后续区间，补齐后确认点前进。](../../assets/images/network-basics/08-tcp-recovery.svg)

不要把 `ACK=2001` 理解成“第 2001 个包收到了”。同样，ACK 证明的是对端 TCP 栈的接收进度，不证明应用已经消费这些字节，更不证明数据库已经提交交易。

## 乱序到达，为什么应用没有直接看见后半段？

普通 TCP 流向应用提供有序字节。接收栈可以暂存越过空洞的内容，等待缺失部分；在空洞被补齐以前，后续字节通常不能跨过它交给流读取者。

这有利于让应用按顺序解析文件或消息，却也引入等待。某一小段丢失，会阻挡这条字节流中后面已经到达的内容。后面讨论 HTTP/2 时，这个性质会解释为什么多路复用仍可能受到 TCP 队头阻塞影响。

但不要据此认为应用一定一次读到完整图片。TCP 维护字节顺序，不维护应用的“图片”或“消息”概念。一次 `recv(4096)` 可能只返回几百字节；之后再读，才能继续获得后续内容。

## 发送方怎么怀疑发生了丢失？

主要有两类线索：确认长时间没有推进，以及后续确认反复指向同一个空洞。

**重传超时**依赖对往返时间及其变化的估计。发送方不能为全互联网固定一个极短等待值，否则跨洋连接还没来得及回应，就会被反复误判；也不能无限等待。超时后的退避进一步限制重复发送压力。[RFC 6298](https://www.rfc-editor.org/rfc/rfc6298.html)规定了基础重传计时算法。

**快速重传**利用重复确认等反馈，可能在定时器到期前发现空洞。经典算法用三次重复 ACK 作为触发条件之一，但现代实现还有其他检测与恢复机制。不能把“每一次重传之前必有三个重复 ACK”当成抓包定律。[RFC 8985](https://www.rfc-editor.org/rfc/rfc8985.html)描述的 RACK-TLP 就利用时间信息改善损失判断。

重传还可能是误判：原数据并没有丢，只是被延迟了。TCP 需要处理后来到达的重复数据，避免把同一段字节作为新的应用内容交付两次。

## SACK 给出的，是空洞后面的地图

单靠累积 ACK，发送方知道 2001 之前的字节连续到达，却不知道 C 是否已经收到。选择性确认 SACK 可以补充“这些不连续区间也收到了”的信息。

在上面的例子中，接收方可能继续给出 `ACK=2001`，同时报告 SACK 区间 `[3001, 4001)`。发送方因此更有依据地补发 B，而不是把 B 后面所有内容盲目再发一遍。

SACK 不会把累积 ACK 的含义改成“跳过空洞”。它是附加信息，需要双方支持并在握手中协商许可；发送方也仍需保留恢复所需的数据和状态。具体定义见 [RFC 2018](https://www.rfc-editor.org/rfc/rfc2018.html)。

当 B 最终到达，接收方可以把已有 C 接到后面，连续确认点推进到 4001。这个推进是因为字节区间终于连续了，而不是因为数据包的数量凑够了。

## “可靠”有哪些边界？

TCP 会尽力提供可靠、有序的字节流，但无法在断网、主机崩溃或无限故障下保证最终成功。它可能以超时或连接错误结束，应用仍然要处理失败。

更微妙的是：请求已经送到并处理，响应却在返回途中丢失。客户端只看到失败，不知道服务端是否完成操作。重新连接并重试“扣款”就可能产生重复业务。

因此，传输层的重复消除不能替代应用的幂等键、请求标识和事务设计。TCP 解决的是一条连接内部的字节传输，不是跨连接的业务“恰好执行一次”。

## 为什么两次 send 不等于两次 recv？

假设应用连续发送 `hello` 和 `world`。接收端可能分别读到它们，也可能读到 `helloworld`，还可能先读到 `hel`。这些都不意味着 TCP 弄坏了内容。

发送调用把字节交给协议栈；接收调用从当前可读字节中取一部分。调用时机和缓冲区大小不同，边界自然可以不同。“粘包”常用来描述这个现象，但容易让人误以为网络发生了额外故障：问题通常是应用没有定义消息边界。

常见方案包括固定长度、分隔符，以及长度前缀。文本按行分隔时要处理转义或禁止消息内部出现分隔符；长度前缀则必须限制最大长度，避免收到一个离谱数字就分配巨量内存。

## 动手：让同一串消息以不同块大小到达

下面的离线程序定义一个简单协议：两字节无符号大端长度，随后是相应长度的消息。它故意把输入拆在长度字段中间，也让多个消息出现在同一块里。

```python
import struct

messages = [b"hello", b"world!"]
wire = b"".join(struct.pack("!H", len(m)) + m for m in messages)


def decode(chunks):
    buffer = bytearray()
    result = []
    for chunk in chunks:
        buffer.extend(chunk)
        while len(buffer) >= 2:
            length = int.from_bytes(buffer[:2], "big")
            if length > 4096:
                raise ValueError("message too large")
            if len(buffer) < 2 + length:
                break
            result.append(bytes(buffer[2:2 + length]))
            del buffer[:2 + length]
    if buffer:
        raise ValueError("incomplete message at end of input")
    return result


cases = [[wire], [wire[:1], wire[1:8], wire[8:]],
         [bytes([value]) for value in wire]]
for chunks in cases:
    decoded = decode(chunks)
    assert decoded == messages
    print(decoded)
```

三次都应该输出 `[b'hello', b'world!']`。如果最后少给一个字节，会在输入结束时报告消息不完整。

这里验证的是解析器对任意分块的适应能力，**没有模拟 TCP 的重传、拥塞控制或真实网络丢包**。真实 Socket 程序中，把每次 `recv()` 的结果喂给同样的缓冲逻辑即可；还应给消息大小、读取期限和总资源消耗设置边界。

## 抓包里的重传标签，能直接当结论吗？

Wireshark 的分析标签是根据捕获内容推断出来的。抓包点漏包、开始捕获过晚、网卡卸载和乱序，都可能影响解释。[Wireshark TCP 分析说明](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvTCPAnalysis.html)列出了相关判定与优先级。

看到重传提示时，先核对序列号区间、ACK/SACK、时序和捕获位置。若要确定故障段，尽量对照两端证据，而不是仅凭一端的一行红色提示就宣布运营商丢包。

可以手算一道题：A 和 C 到达、B 缺失时，累积确认能否越过 B？不能。若应用又恰好读取了 500 字节，是否会改变对端已确认的总范围？也不必然。传输确认、内核缓冲和应用读取是不同层次的进度。

上一篇：[TCP 三次握手](/blog/posts/why-tcp-needs-a-three-way-handshake/)

下一篇：[为什么带宽很大，下载却不一定快](/blog/posts/why-high-bandwidth-does-not-guarantee-speed/)

## 参考与延伸阅读

- [RFC 2018](https://www.rfc-editor.org/rfc/rfc2018.html)——选择性确认。
- [RFC 6298](https://www.rfc-editor.org/rfc/rfc6298.html)——重传计时器。
- [RFC 8985](https://www.rfc-editor.org/rfc/rfc8985.html)——RACK-TLP 损失检测。
- [Beej：Slightly Advanced Techniques](https://beej.us/guide/bgnet/html/split/slightly-advanced-techniques.html)——处理部分收发与消息封装。
- [Wireshark：TCP Analysis](https://www.wireshark.org/docs/wsug_html_chunked/ChAdvTCPAnalysis.html)——抓包工具分析的含义与限制。
