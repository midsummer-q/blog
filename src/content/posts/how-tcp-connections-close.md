---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
modDatetime: 2026-10-17T16:00:00Z
title: TCP 连接怎样结束：FIN、RST 与 TIME_WAIT
featured: false
draft: false
ogImage: ../../assets/images/network-basics/10-tcp-close-og.png
tags:
  - 计算机网络
  - 传输控制协议
  - 网络排障
series:
  name: 计算机网络通识
  order: 10
description: 用提交文字、等待结果的场景解释双向字节流与半关闭，再读懂 FIN、EOF、RST、TIME_WAIT 和本机收发实验。
---

聊天结束时，你说“我说完了”，不代表对方不能再补一句。TCP 关闭也有两个方向：一端不再发送，另一端仍可能有结果需要送回来。

本篇先跟着“客户端提交一段文字，服务器返回统计结果”的场景走一遍，再解释 FIN、RST 和那些看起来很吓人的状态名。不需要先记住完整的 TCP 状态图。

## Table of contents

## 一条连接为什么有两个方向？

**TCP 字节流** 表示应用可以按顺序读写一串字节。建立一条 TCP 连接以后，A 可以向 B 发，B 也可以向 A 发，这叫双向通信。两个方向有自己的数据进度。

假设 A 发给 B 一段文字，希望 B 返回统计结果。A 最后一个字节发完，只能说明 A 暂时没有更多内容；B 不能凭一瞬间安静就知道“全文已结束”，因为 A 也许还在准备下一批。

因此应用需要约定结束标志。可以事先写长度、使用特定分隔符，也可以在某些简单协议里用“本方向不再发送”表示结束。本篇使用最后一种方式演示 **半关闭**。

半关闭就是只结束一个发送方向，仍保留另一方向的通信能力。它不是连接坏了一半，也不是只发了一半文件。

## 用一次文字统计，理解 FIN 与 EOF

A 把文字发完，随后告诉 TCP：“我不再向 B 发送新字节，但还要接收 B 的结果。”TCP 用一个叫 **FIN** 的控制标志表达这个方向的结束。

B 的 TCP 先按顺序收齐 FIN 之前的数据。B 的程序读完这些字节，再继续读取，就会得到“流结束”的信号，称为 **EOF**，即 End Of File。这个名字虽然有 File，但在 Socket 流中同样使用，并不表示正在打开磁盘文件。

这时 B 可以统计文字，再向 A 发送结果。A 已停止发送不妨碍它接收。B 的结果发完后，也可以结束自己的发送方向，整个双向关闭才继续完成。

| 情况                 | 接收程序应怎样理解                       |
| -------------------- | ---------------------------------------- |
| 暂时还没有新数据     | 可能需要等待，不能自动认定结束           |
| 已读完数据并读到 EOF | 对端这个方向已正常结束，不会再有后续字节 |
| 读取抛出错误         | 连接可能异常中止，需要按错误处理         |

## 四个动作，分别是谁在说话？

先不看状态缩写，只读下面的对话：

```text
A → B：我这个方向发完了。      FIN
B → A：收到你的结束通知。      ACK
B → A：我的结果也都发完了。    FIN
A → B：收到你的结束通知。      ACK
```

第二行与第三行中间，B 可能还要计算并发送结果，所以它们可以不是同一时刻。这就是教材常画“四次挥手”的原因：两个方向分别结束、分别确认。

也可能 B 当时正好也没有更多数据，确认与自己的 FIN 合在一个报文里；双方也可能同时结束。因此先理解四种逻辑动作，再理解抓包时实际出现几份报文，不能倒过来数包背结论。

FIN 和握手时的 SYN 一样占用一个序列号。它要位于前面数据之后，这样接收方才不会把“我结束了”提前交给程序，而漏掉还没有补齐的字节。

## 用中文读懂状态，不把英文当故障结论

**CLOSE_WAIT** 可以先读成：“已经知道对方发完，等待我方应用处理完并关闭。”在文字统计的例子里，B 正在计算，短暂出现它很自然；计算结束以后长期不关闭，才需要继续检查。

**TIME_WAIT** 可以先读成：“双方已进入正常关闭的末尾，本地还保留一段协议状态。”最后一个 ACK 可能丢失，对方会重发 FIN；保留状态有助于正确回应，也用于降低旧报文影响后续连接的风险。

因此，看见 TIME_WAIT 不等于应用忘记关闭。相反，它往往出现在按正常流程主动关闭的一侧。客户端或服务器都可能主动关闭，不能只凭角色猜状态。

## RST：异常中止和正常结束不是一个意思

**RST** 表示重置连接，不能把它解释成“对方全部内容已经正常发完”。例如一次连接不被接受，或已有连接被中止，都可能涉及重置；具体要结合观察位置和上下文。

正常 FIN 更像“我的内容到这里结束”；RST 更像“不能继续按这次连接的状态交流”。为了减少状态数量而一律改成强制中止，可能破坏未完成的数据交付。

下面先给出 FIN 的精确行为和状态表，再做本机实验。第一次阅读时，先对照上面的中文解释，不需要一口气记下所有 `WAIT` 的编号。

## FIN 表示这个方向没有更多字节

假设客户端已发送完请求，想告诉服务器：“我的请求到这里结束，但我还要接收你的结果。”这就是半关闭适合表达的场景。

TCP 的 FIN 排在该方向已经发送的数据之后，并占用一个序列号。对端按顺序处理到 FIN 后，应用读取完此前的数据，再调用流式 `recv()`，就会得到空字节串，表示 EOF。

EOF 不表示最后一批数据是空的，也不表示连接的另一方向不能再发送。如果程序把 `recv()` 返回 `b""` 当成“暂时没有数据”继续无限循环，就会产生错误行为；阻塞读取暂时没有数据时会等待，超时模式则可能抛出超时异常。

## 为什么常见图里有四次挥手？

正常关闭可以画成：客户端 FIN、服务器 ACK、服务器 FIN、客户端 ACK。这样画，是因为服务器可以先确认客户端不再发送，再等待自己的应用完成工作后关闭发送方向。

![两个方向分别关闭；主动关闭方在确认对端 FIN 后进入 TIME_WAIT 的典型路径。](../../assets/images/network-basics/10-tcp-close.svg)

| 观察位置                | 典型状态   | 应怎样理解                                 |
| :---------------------- | :--------- | :----------------------------------------- |
| 客户端发出 FIN 后       | FIN_WAIT_1 | 等待自己 FIN 得到确认                      |
| 客户端 FIN 被确认后     | FIN_WAIT_2 | 本端已结束发送，仍等待对端结束             |
| 服务器收到 FIN 后       | CLOSE_WAIT | 对端结束发送，本地应用尚未关闭发送方向     |
| 服务器也发送 FIN 后     | LAST_ACK   | 等待最后确认                               |
| 客户端确认服务器 FIN 后 | TIME_WAIT  | 保留状态，处理迟到报文及最后确认丢失等情况 |

这只是常见单方先关闭路径。ACK 与 FIN 可以合并，双方也可能同时关闭，所以**正常关闭不保证抓包里恰好只有四个独立报文**。理解两个方向的结束和确认，比数箭头更重要。

## shutdown 和 close 不是同一个动作

Socket API 中的 `shutdown(SHUT_WR)` 表示结束本地发送方向，同时保留读取能力。`close()` 则释放当前程序持有的 Socket 句柄；其最终网络效果还与其他引用、未发送数据、关闭选项和系统实现有关。

[Linux shutdown 手册](https://man7.org/linux/man-pages/man2/shutdown.2.html)区分了停止接收、停止发送和两者都停止。不要用“调用 close 等于立即发出一个 FIN 并立刻释放所有网络状态”概括所有情况。

对于只需请求一次、随后等待结果的简单协议，半关闭可以作为“请求体结束”的信号。但 HTTP 等协议已经定义了自身消息边界，不能随意用关闭写方向代替它们的报文格式。

## 可选实验：结束发送后继续接收结果

把代码保存为 `tcp_half_close.py`，按[Python 准备说明](/blog/posts/understanding-ports-and-sockets/#可选编程实验的准备怎样运行本系列的-python-代码)运行。

这里 `sendall()` 请求发送完整的短字节串，`shutdown(SHUT_WR)` 表示不再发送，`recv(1024)` 每次最多取 1024 字节。函数 `read_until_eof` 把每次读取的内容暂存；读到空字节串 `b""` 后才结束循环、拼接结果。这样不会把一次读取的边界误当成整个请求的边界。

预期的关键现象是：客户端结束发送后，仍能打印服务器返回的那一行。实验没有安装远端服务，双方都是本机 Socket。

下面的示例仍只使用本机回环地址。客户端发送短请求并关闭写方向，服务器读到 EOF 后回传结果，客户端继续读取直到服务器也结束发送。

```python
import socket


def read_until_eof(sock):
    parts = []
    while True:
        block = sock.recv(1024)
        if not block:
            return b"".join(parts)
        parts.append(block)


with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    listener.settimeout(2)
    with socket.create_connection(listener.getsockname(), timeout=2) as client:
        connection, _ = listener.accept()
        with connection:
            connection.settimeout(2)
            client.sendall(b"finished request")
            client.shutdown(socket.SHUT_WR)

            request = read_until_eof(connection)
            print("server got:", request)
            connection.sendall(b"result after client EOF")
            connection.shutdown(socket.SHUT_WR)
            print("client got:", read_until_eof(client))
```

输出应为：

```text
server got: b'finished request'
client got: b'result after client EOF'
```

两端请求和结果都很短，因此顺序执行即可。把这个模式直接用于任意大数据、双方同时写入的协议，可能由于缓冲区与读取顺序而互相等待；真实服务还需要并发调度和资源限制。

这个实验验证半关闭后仍可接收数据，没有测量 TIME_WAIT 的持续时间，也没有模拟异常断网。

## RST 为什么不是“更快的 FIN”？

FIN 是有序结束一个方向；RST 则重置连接状态，表示连接不能继续按原来的正常流程进行。它可能来自没有匹配连接的端点，也可能与应用主动中止、协议状态不符或中间设备有关。

收到 RST，应用可能在读写时看到连接重置等错误，但错误出现的具体调用和时机与系统、缓冲状态有关。不能保证远端发出 RST 的同一瞬间，应用正在执行的代码马上得到通知。

因此，不应该为了减少 TIME_WAIT 就把所有连接都改成重置关闭。这样做可能丢弃尚未完成交付的数据，也会改变对端所见的结束语义。关闭速度不是唯一目标。

## TIME_WAIT 和 CLOSE_WAIT 应该分开看

TIME_WAIT 常出现在执行正常主动关闭的一侧，既可能是客户端，也可能是服务器。它帮助最后 ACK 丢失后的恢复，并降低旧连接报文干扰后来连接的风险。规范中的 2MSL 是协议概念，操作系统实际等待策略与实现不能直接用一个固定秒数概括。

大量短连接可以自然产生很多 TIME_WAIT，不等于应用忘了关 Socket。真正的问题是数量、增长趋势、临时端口压力和业务失败是否相关，而不是看到状态名就清零。

CLOSE_WAIT 则表示已经知道对方结束发送，而本地应用还没有完成关闭流程。短暂存在很正常；持续积累时，更应该检查异常路径、资源释放和程序是否仍在等待不可能到来的输入。

[Linux tcp 手册](https://man7.org/linux/man-pages/man7/tcp.7.html)给出了实现相关的状态、选项和计时说明。阅读优化建议时，要确认系统版本和适用条件，避免把内核参数当成通用修复按钮。

## 进阶：超时与保活，究竟在等什么？

| 机制            | 主要关注                   | 不能代替什么               |
| :-------------- | :------------------------- | :------------------------- |
| 应用请求期限    | 用户愿意等一次操作多久     | 不等于 TCP 的重传期限      |
| Socket 读写超时 | 某次 API 操作的等待        | 不自动证明业务是否完成     |
| TCP 重传计时    | 已发送内容迟迟未被确认     | 不能发现所有纯空闲连接故障 |
| TCP keepalive   | 空闲时探测连接是否仍可通信 | 不验证远端业务线程健康     |
| 应用心跳        | 对端应用是否按约定处理消息 | 不保证接下来的业务一定成功 |

链路中断时，如果双方都没有发送数据，也没有保活，连接状态可能长时间维持 ESTABLISHED。状态表示本地协议栈当前所知，不是持续更新的全球真相。

Linux 的 `TCP_USER_TIMEOUT` 可以限制某些未确认或无法继续发送的数据等待时间，但它和 keepalive 的交互需要结合实现核实。Cloudflare 的上述文章很适合学习实验方法，不宜直接复制其中旧版本参数作为所有环境的最佳值。

## 观察现有连接，而不是先改参数

在 Windows PowerShell 中可以查看：

```powershell
Get-NetTCPConnection |
  Group-Object State |
  Select-Object Name, Count
```

Linux 可用：

```bash
ss -tan
```

这些命令由读者在自己的环境执行。记录时间、进程、连接端点和错误日志，再比较状态是否持续积累。一次快照只能说明当时的情况，不能单独定位谁泄漏了资源。

最后想一想：服务器收到客户端 FIN 后，还要计算并返回结果，此时出现 CLOSE_WAIT 是否必然是 bug？并不是；关键在于应用是否仍有合理工作，以及完成后是否正确关闭。

上一篇：[带宽、RTT 与窗口](/blog/posts/why-high-bandwidth-does-not-guarantee-speed/)

下一篇：[HTTP 请求与响应](/blog/posts/understanding-http-requests-responses-and-caching/)

## 参考与延伸阅读

- [Cloudflare：When TCP sockets refuse to die](https://blog.cloudflare.com/when-tcp-sockets-refuse-to-die/)——通过实验区分多种超时与保活行为。
- [Linux shutdown(2)](https://man7.org/linux/man-pages/man2/shutdown.2.html)——半关闭接口。
- [Linux tcp(7)](https://man7.org/linux/man-pages/man7/tcp.7.html)——TCP 的 Linux 实现选项。
- [RFC 9293](https://www.rfc-editor.org/rfc/rfc9293.html)——连接关闭与状态机的基础定义。
