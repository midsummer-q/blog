---
author: midsummer-q
pubDatetime: 2026-10-16T16:00:00Z
title: HTTP：浏览器与服务器究竟在说什么？
featured: false
draft: false
ogImage: ../../assets/images/network-basics/11-http-and-cache-og.png
tags:
  - 计算机网络
  - 超文本传输协议
  - Web缓存
series:
  name: 计算机网络通识
  order: 11
description: 从一对 HTTP 请求与响应出发，理解方法、状态码、消息边界、连接复用和条件缓存，并在本机观察 200 与 304。
---

浏览器显示 404，说明网络完全没连上吗？刷新页面后看到 304，说明服务器发生错误吗？连续访问两个页面，是否一定要重新建立两次 TCP 连接？

要回答这些问题，需要从 TCP 提供的字节流再向上一层。**HTTP 约定如何表达请求、描述响应，以及解释方法、状态和缓存信息。** 传输成功只是让这些消息有机会送达；消息的含义要由 HTTP 和应用继续解释。

本文使用可读的 HTTP/1.1 文本形式讲清消息结构。HTTP/2、HTTP/3 的线格式不同，但仍沿用许多方法、状态码和字段语义，不应把所有 HTTP 都想成在网上逐行发送文本。

## Table of contents

## 一次请求在问什么？

考虑一条教学请求，实际 HTTP/1.1 行结束使用 CRLF：

```http
GET /notes/network?lang=zh HTTP/1.1
Host: example.com
Accept: text/plain

```

`GET` 是方法，`/notes/network?lang=zh` 是请求目标，`Host` 帮助服务器区分目标主机。空行结束字段部分；这个请求没有消息体。URL 中的 `#fragment` 一般留给浏览器处理，不会放进这里的请求目标。

服务器可能返回：

```http
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Content-Length: 5
Cache-Control: max-age=60
ETag: "v1"

hello
```

这里示意消息体是恰好五个 ASCII 字节 `hello`，不包含展示排版带来的末尾换行。`Content-Type` 表达内容类型，`Content-Length` 以字节为单位描述长度，ETag 则是表示版本的验证器，不必一定是文件哈希。

同样是 `200`，正文可以是图片、HTML 或 JSON。状态码告诉客户端如何解释这次 HTTP 处理结果，不代替业务内容的完整协议。

## 方法描述语义，不只是接口命名风格

| 方法   | 常见语义                              | 容易误解的地方                               |
| :----- | :------------------------------------ | :------------------------------------------- |
| GET    | 获取选定资源的表示                    | 不应把它设计成执行扣款等用户请求的状态变更   |
| HEAD   | 获取与 GET 对应的响应元信息，不传正文 | Content-Length 可以描述 GET 本来会返回的长度 |
| POST   | 将内容交给资源按自身规则处理          | 不天然保证幂等，也不天然更安全               |
| PUT    | 创建或替换目标资源的状态              | 重复执行的预期效果应符合幂等语义             |
| DELETE | 请求移除目标资源的关联                | 两次响应码可以不同，不否定幂等性             |

“安全方法”在 HTTP 中是语义术语，指客户端没有请求改变资源状态；不表示绝无日志、计数等副作用，更不表示传输加密。“幂等”关注重复请求的预期效果，不要求每次返回完全相同的状态码或时间戳。相关定义见 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)。

因此，重试要结合方法语义、应用实现和请求标识。即便方法通常幂等，也仍需考虑权限、资源版本和并发修改。

## 状态码是分层排障的线索

收到正常可解析的 404，至少说明某个 HTTP 响应者已经回答；它可能是源站，也可能是代理或 CDN。此时优先检查路径、主机名和路由规则，比重新检查网线更有针对性。

| 类别 | 大致含义               | 示例               |
| :--- | :--------------------- | :----------------- |
| 2xx  | 请求成功处理           | 200、201、204      |
| 3xx  | 重定向或其他进一步处理 | 301、302、304      |
| 4xx  | 请求存在相关问题       | 400、401、403、404 |
| 5xx  | 服务端或网关处理失败   | 500、502、503、504 |

304 有特殊用途：对于条件 GET 或 HEAD，服务端说明选定表示没有变化，客户端可以复用已有内容。它不是“拿到一份空白页面”，也不应该被浏览器当成需要直接展示的正文。

某个业务接口把错误写进 200 的 JSON 中，是应用设计选择；这不意味着所有 200 都能证明业务成功。观测时应同时记录 HTTP 状态和应用错误字段。

## 长连接怎样知道上一条响应结束了？

如果一条 TCP 连接可以传多次 HTTP 交互，就不能总依赖断开连接来划分消息。HTTP/1.1 有自己的边界规则，例如有效的 `Content-Length`，或适用情况下的分块传输编码。

```http
Transfer-Encoding: chunked

5
hello
0

```

这是省略了其他字段的教学片段；分块长度用十六进制，真实行结束仍是 CRLF。终止块以及可能的 trailer 部分有专门规则，不能仅搜索一个字符 `0` 就判断结束。

不同方法和响应状态也会影响正文是否存在。实现解析器必须遵守 [RFC 9112](https://www.rfc-editor.org/rfc/rfc9112.html)的优先规则，不能把“遇到空行后都是正文”或“永远相信 Content-Length”当成通用算法。实际开发应使用成熟 HTTP 库，不在几行字符串切分代码上承载生产入口。

HTTP/1.1 默认可以使用持久连接，但服务端、客户端或中间设备仍可关闭它。连接池保留的连接也可能已经失效；连接复用不意味着无限期存活。

## 缓存要分成“够新吗”和“变了吗”

缓存首先考虑能否直接复用：例如响应仍在 `max-age` 指定的新鲜期内，且满足其他缓存规则，可能无需再次访问服务器。

需要验证时，客户端可以带上 `If-None-Match: "v1"`。若表示仍匹配，服务端返回 304；若变化，则返回新的 200 和正文。前者省下的是正文传输，不是所有网络往返。

![HTTP 缓存从首次 200 保存正文，到新鲜期复用，再到 ETag 条件验证的三种路径。](../../assets/images/network-basics/11-http-and-cache.svg)

[MDN 的缓存指南](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)特别适合对照几个容易混淆的字段：`no-cache` 允许存储，但复用前需要验证；`no-store` 要求不存储；`private` 限制共享缓存存储，仍可能允许用户自己的私有缓存。

如果同一 URL 根据 `Accept-Language` 产生不同语言，缓存还需要知道响应在哪些请求字段上变化，`Vary` 就用于表达这种选择维度。把不同用户的个性化内容错误地放入公共共享缓存，比缓存命中率低更严重。

## 动手：本机观察 200 和 304

下面程序只监听回环地址，由客户端显式发送条件请求。它不是完整缓存实现，也不会自动下载外部内容。

```python
from contextlib import closing
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        unchanged = self.headers.get("If-None-Match") == '"v1"'
        self.send_response(304 if unchanged else 200)
        self.send_header("ETag", '"v1"')
        self.send_header("Cache-Control", "max-age=0")
        if not unchanged:
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", "5")
        self.end_headers()
        if not unchanged:
            self.wfile.write(b"hello")

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
worker = Thread(target=server.serve_forever, daemon=True)
worker.start()
try:
    with closing(HTTPConnection(*server.server_address, timeout=2)) as client:
        client.request("GET", "/")
        first = client.getresponse()
        saved_body = first.read()
        etag = first.getheader("ETag")
        print(first.status, saved_body)

        client.request("GET", "/", headers={"If-None-Match": etag})
        second = client.getresponse()
        print(second.status, second.read())
        if second.status == 304:
            print("reuse:", saved_body)
finally:
    server.shutdown()
    server.server_close()
    worker.join()
```

预期输出：

```text
200 b'hello'
304 b''
reuse: b'hello'
```

第一次正文被保存，第二次响应没有正文，我们显式复用旧内容。若把请求中的 ETag 改成 `"different"`，这个教学服务会重新返回 200。

该服务没有通用的资源选择、认证、弱验证器解析或完整条件请求逻辑。它只演示本例的一个 ETag；真实服务应由框架实现完整规则，缓存行为以 [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)为准。

## 在浏览器里把概念接起来

打开自己的网站，在开发者工具 Network 面板检查方法、状态、协议和字段。先观察正常刷新，再开启 Disable cache 做对照；注意该选项的生效条件与浏览器有关。

内存缓存、磁盘缓存、Service Worker 和网络 304 不是同一种来源。不要看见“页面瞬间出来”就认定没有网络，也不要看见 304 就把缓存命中理解成完全不访问服务端。

最后回到开头的问题：404 说明收到了 HTTP 层回应；304 需要结合已有缓存解释；长连接则允许多次请求复用传输连接。三个现象属于不同机制，分开观察才不会互相误导。

上一篇：[TCP 连接怎样结束](/blog/posts/how-tcp-connections-close/)

下一篇：[HTTPS 怎样让通信可信](/blog/posts/how-https-and-tls-establish-trust/)

## 参考与延伸阅读

- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)——HTTP 语义。
- [RFC 9112](https://www.rfc-editor.org/rfc/rfc9112.html)——HTTP/1.1 消息格式与边界。
- [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)——缓存规则。
- [MDN：HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching)——新鲜度、验证和缓存控制的实例。
