---
author: midsummer-q
pubDatetime: 2026-11-06T00:00:00Z
title: C++ 万能引用与完美转发：从引用折叠到 std::forward
featured: false
draft: false
tags:
  - C++
  - 模板编程
  - 现代C++
series:
  name: 计算机底层与设计哲学
  order: 8
description: 从值类别和引用折叠出发，拆解 C++ 万能引用的判定规则与模板推导矩阵，解释 std::move 与 std::forward 的实现差异，并结合 make_unique、emplace_back、泛型包装器等场景说明完美转发的正确写法与常见陷阱。
---

先看一个很常见的包装函数：它想在参数交给下游之前顺手打一行日志。

```cpp
#include <iostream>
#include <string>
#include <utility>

void consume(const std::string& s) {
    std::string copy = s;
    std::cout << "[copy] " << copy << '\n';
}

void consume(std::string&& s) {
    std::string taken = std::move(s);
    std::cout << "[move] " << taken << '\n';
}

template <typename T>
void log_and_consume(const T& value) {
    std::cout << "log: " << value << '\n';
    consume(value);
}

int main() {
    std::string owned = "owned";
    log_and_consume(owned);
    log_and_consume(std::string("temporary"));
}
```

调用两次，输出都是 `[copy]`：

```text
log: owned
[copy] owned
log: temporary
[copy] temporary
```

第二次调用传入的是临时对象，本来可以走移动构造，却仍然复制了一份。原因有两层：`const T&` 在入口处把右值变成了“只能只读的左值”；进入函数体后，`value` 是一个具名变量，本身也还是左值。就算把参数改成 `T&&`，只要函数体里直接写 `consume(value)`，结果依旧不变。

```cpp
template <typename T>
void log_and_consume(T&& value) {
    std::cout << "log: " << value << '\n';
    consume(value);   // 仍然是左值
}
```

要修好它，需要两个部件：**万能引用**负责在入口处既不复制、也不丢掉值类别；**`std::forward`** 负责在出口处把值类别原样交还给下游。这篇文章就沿着这条线索，把判定规则、推导过程、标准库实现和常见陷阱依次拆开。

## Table of contents

## 1. 先看看不用它们会怎样

在展开机制之前，值得先确认“万能引用 + `std::forward`”到底解决了哪些现有方案解决不了的问题。

### 1.1 按值传参

```cpp
template <typename T>
void log_and_consume(T value) {
    std::cout << "log: " << value << '\n';
    consume(std::move(value));
}
```

按值传参对右值很友好：临时对象可以直接移动进来，函数体里再移动给下游。但它对左值不友好——调用者手里那份对象需要复制一次。除此之外还有两个问题：

- 派生类对象按基类值传递会被**切片**，只保留基类部分。
- 不可复制类型（如 `std::unique_ptr`）作为左值传入时无法编译。

### 1.2 为左值和右值各写一个重载

```cpp
void log_and_consume(std::string& value);
void log_and_consume(const std::string& value);
void log_and_consume(std::string&& value);
```

参数一多，重载数量就按指数增长——每个参数至少要考虑左值和右值两种形态。而且函数体里还得分别决定谁该 `std::move`、谁不能，维护成本很高。

### 1.3 按 `const T&` 接收

这就是开头的写法。它什么问题都能接，但接受之后统一变成只读左值，右值信息在入口处就丢了。

### 1.4 用 `T&&` 接，然后 `std::move`

```cpp
template <typename T>
void log_and_consume(T&& value) {
    consume(std::move(value));   // 对左值也搬
}
```

这能通过编译，但调用 `log_and_consume(s)` 会把调用者仍然持有的 `s` 搬空。问题从“多一次复制”升级成了“破坏调用者的对象”，性质更严重。

把这四种方案放在一起，缺口就很清楚了：

| 方案                | 左值 | 右值 | 主要问题                                 |
| ------------------- | ---- | ---- | ---------------------------------------- |
| `T`                 | 复制 | 移动 | 左值多一次复制；切片；不可复制类型受限制 |
| 重载                | 引用 | 引用 | 重载数量指数增长                         |
| `const T&`          | 引用 | 引用 | 丢失右值性                               |
| `T&&` + `std::move` | 搬走 | 搬走 | 错误地移动左值                           |

万能引用解决“入口”，完美转发解决“出口”，两者合起来才是完整的方案。

## 2. 值类别：转发到底在转发什么

完美转发保留的不是“类型”这么简单，而是实参的**值类别**、**const 限定**和**类型本身**。其中值类别最容易被忽略，先把它理清。

值类别描述的是**表达式**，不是类型。同一个 `int` 类型的对象，出现在不同表达式里，值类别可能不同。

| 值类别         | 有身份（可取地址） | 能否被安全搬走           | 典型表达式                            |
| -------------- | ------------------ | ------------------------ | ------------------------------------- |
| 左值 lvalue    | 是                 | 否，除非显式 `std::move` | `i`、`++i`、`*p`、`arr[0]`、`"hi"`    |
| 将亡值 xvalue  | 是                 | 是                       | `std::move(i)`、`static_cast<T&&>(x)` |
| 纯右值 prvalue | 否                 | 是，用来构造新对象       | `42`、`i++`、`make_string()`          |

两个组合名也顺带记住：

- **泛左值 glvalue** = 左值 + 将亡值，共同点是“有身份”。
- **右值 rvalue** = 将亡值 + 纯右值，共同点是“可以被移动”。

C++17 之后，纯右值更像一张“构造对象的配方”，在需要时才会被**物化**（materialize）成临时对象。`std::string("hello")` 本身是纯右值；当它绑定到引用时，才产生一个临时对象。

这里要纠正一个常见说法：`std::move` 并不移动任何东西。它的全部工作是**把表达式转换成将亡值**；真正发生移动，是因为这个将亡值让重载决议选中了移动构造函数或移动赋值运算符。

```cpp
std::string a = "hello";
std::string b = std::move(a);   // 选中的是 std::string(std::string&&)
```

所以“转发”这个词的重点不是搬运内存，而是**把实参原本的值类别继续传下去**，让下游的重载决议看到和调用者写下的相同信息。

## 3. 万能引用的判定规则

“万能引用”是 Scott Meyers 在 2012 年提出的叫法，C++ 标准里使用的正式术语是 **forwarding reference**（转发引用）。本文两个词混用，指的是同一件事。

标准里的定义可以概括为两句话：

1. 形参是一个**右值引用**，引用的是**函数模板的、无 cv 限定的模板参数**。
2. 这个模板参数在**调用点**由实参推导，而不是在类模板实例化时或显式指定时确定。

另外，`auto&&` 在发生推导时也遵循同样的规则（花括号列表等特殊情况除外）。

### 3.1 两个条件缺一不可

“形参正好是 `T&&`”和“T 在调用点推导”，必须同时成立。

| 声明                                                               | 是万能引用吗   | 原因                                 |
| ------------------------------------------------------------------ | -------------- | ------------------------------------ |
| `template <class T> void f(T&&);`                                  | 是             | T 在调用点推导，形参正好是 `T&&`     |
| `template <class T> void f(const T&&);`                            | 否             | 带 `const`，是右值引用               |
| `template <class T> void f(std::vector<T>&&);`                     | 否             | 形参是 `vector<T>&&`，不是 `T&&`     |
| `void f(int&&);`                                                   | 否             | 没有模板参数，也没有推导             |
| `template <class T> struct S { void f(T&&); };`                    | 否             | T 在 `S<int>` 时已经确定             |
| `template <class T> struct S { template <class U> void f(U&&); };` | 是             | U 在成员函数调用点推导               |
| `template <class T> void f(T&&); f<int>(i);`                       | 否（这次调用） | 显式模板实参关闭推导，形参是 `int&&` |
| `auto&& x = expr;`                                                 | 是             | 等价于用 `expr` 调用 `f(T&&)`        |
| `const auto&& x = expr;`                                           | 否             | 带 `const`，是右值引用               |
| `auto&& x = {1, 2, 3};`                                            | 否             | 花括号列表有特殊推导规则             |

最容易踩的三个反例是 `const T&&`、类模板成员 `void f(T&&)` 和显式写出的 `f<int>(i)`。它们的共同点是：**`&&` 仍然在那里，但推导条件不成立**。

### 3.2 万能引用不是一种类型

不能通过 `typedef` 或 `using` 造出一个“万能引用类型”：

```cpp
template <typename T>
using RRef = T&&;

RRef<int>  a = 1;   // int&&
RRef<int&> b = a;   // int&（引用折叠）
```

`RRef` 确实会根据 `T` 折叠出不同的引用类型，但它没有“在调用点推导 T”这一步。要触发万能引用，必须让**模板参数本身**在调用点被推导。

### 3.3 `auto&&` 的细节

```cpp
int i = 0;

auto&& a = i;               // auto = int&，a 的类型是 int&
auto&& b = 42;              // auto = int， a 的类型是 int&&
auto&& c = std::move(i);    // auto = int， c 的类型是 int&&
const auto&& d = 42;        // 右值引用，不是万能引用
```

在范围 `for` 和泛型 lambda 中，`auto&&` 也按同样规则工作：

```cpp
for (auto&& item : container) { /* ... */ }

auto relay = [](auto&& x) { /* ... */ };
```

但有一处例外：

```cpp
auto&& x = {1, 2, 3};   // auto = std::initializer_list<int>
```

花括号列表没有类型，标准对 `auto` 的推导做了特殊处理，直接推导成 `std::initializer_list<int>`。此时 `x` 是 `initializer_list<int>&&`，不是转发引用。

## 4. 引用折叠：让 `T&&` 装得下左值

如果 `T` 被推导成 `int&`，那么 `T&&` 字面上就变成了 `int& &&`。C++ 不允许直接写“引用的引用”，但在模板替换、`typedef`、`decltype` 这些场景里，这种类型会真实出现，于是语言定义了**引用折叠**（reference collapsing）。

规则只有四条，核心是一句话：**只有 `&& &&` 折叠成 `&&`，其余全是 `&`。**

| 组合    | 折叠结果 |
| ------- | -------- |
| `& &`   | `&`      |
| `& &&`  | `&`      |
| `&& &`  | `&`      |
| `&& &&` | `&&`     |

可以直接用别名验证：

```cpp
using L = int&;
using R = int&&;

int i = 0;

L&  r1 = i;   // int&
L&& r2 = i;   // int&
R&  r3 = i;   // int&
R&& r4 = 1;   // int&&
```

回到模板推导，两条路径就都通了：

```cpp
template <typename T>
void f(T&& x);
```

- 传入左值 `i`：`T` 推导为 `int&`，形参类型是 `int& &&`，折叠为 `int&`。
- 传入右值 `42`：`T` 推导为 `int`，形参类型是 `int&&`。

所以 `T&&` 并不是“某种同时接受左值和右值的引用类型”，而是**一个会根据 `T` 折叠出左值引用或右值引用的类型表达式**。万能引用之所以“万能”，靠的正是这套折叠规则。

## 5. 推导矩阵：T 到底变成了什么

把常见实参代入 `template <typename T> void f(T&&)`，可以得到一张完整的推导表。

```cpp
#include <iostream>
#include <string>
#include <utility>

template <typename T>
void inspect(T&& x) {
    std::cout << __PRETTY_FUNCTION__ << '\n';
    (void)x;
}

int main() {
    int i = 0;
    const int ci = 0;
    int arr[3] = {1, 2, 3};

    inspect(i);
    inspect(42);
    inspect(std::move(i));
    inspect(ci);
    inspect(std::move(ci));
    inspect(arr);
    inspect("hi");
    inspect(nullptr);
}
```

GCC 下 `__PRETTY_FUNCTION__` 会把 `T` 的实际类型打印出来（Clang 和 MSVC 的输出格式不同）：

```text
void inspect(T&&) [with T = int&]
void inspect(T&&) [with T = int]
void inspect(T&&) [with T = int]
void inspect(T&&) [with T = const int&]
void inspect(T&&) [with T = const int]
void inspect(T&&) [with T = int (&)[3]]
void inspect(T&&) [with T = const char (&)[3]]
void inspect(T&&) [with T = std::nullptr_t]
```

整理成表格：

| 实参表达式               | 推导出的 `T`       | 形参类型           |
| ------------------------ | ------------------ | ------------------ |
| `i`（`int` 左值）        | `int&`             | `int&`             |
| `42`                     | `int`              | `int&&`            |
| `std::move(i)`           | `int`              | `int&&`            |
| `ci`（`const int` 左值） | `const int&`       | `const int&`       |
| `std::move(ci)`          | `const int`        | `const int&&`      |
| `arr`（`int[3]` 左值）   | `int(&)[3]`        | `int(&)[3]`        |
| `"hi"`                   | `const char(&)[3]` | `const char(&)[3]` |
| `nullptr`                | `std::nullptr_t`   | `std::nullptr_t&&` |
| `{1, 2, 3}`              | 推导失败           | —                  |

这张表里有四个值得记住的观察。

**第一，`T` 本身可以是引用类型。** 这是 `T&&` 与 `T&`、`const T&` 最大的区别：后两者推导出的 `T` 永远不是引用。也正因如此，`std::forward<T>` 才能从 `T` 里读出“调用者给的是左值还是右值”。

**第二，不发生退化。** 数组还是数组，函数还是函数，字符串字面量还是 `const char[N]`。按值传参时，数组会退化成指针，函数会退化成函数指针；万能引用不会。

**第三，const 被原样保留。** 传入 `const int` 左值，得到 `const int&`；传入 `const int` 右值，得到 `const int&&`。后者虽然能绑定，但通常不能移动——移动构造函数接受的是 `T&&`，不是 `const T&&`。

**第四，`decltype` 看的是声明类型。** 在模板里写 `decltype(x)`，得到的是变量 `x` 的声明类型；写 `decltype((x))`，因为带括号的表达式是左值，得到的是左值引用类型。

```cpp
int i = 0;
decltype(i)   // int
decltype((i)) // int&
```

这个区别在后面用 `std::forward<decltype(x)>` 时会派上用场。

### 5.1 和其他参数写法对比

把四种常见签名放在一起，差异会更直观：

| 签名          | 接受左值   | 接受右值         | const 信息     | 数组/函数类型 | 推导出的 T 是引用 |
| ------------- | ---------- | ---------------- | -------------- | ------------- | ----------------- |
| `f(T)`        | 是（复制） | 是（移动或复制） | 剥离顶层 const | 退化为指针    | 否                |
| `f(T&)`       | 是         | 否               | 保留           | 保留          | 否                |
| `f(const T&)` | 是         | 是               | 统一加上 const | 保留          | 否                |
| `f(T&&)`      | 是         | 是               | 原样保留       | 保留          | 左值时是          |

`f(T)` 的“接受右值”要打个折扣：如果 `T` 是 `std::string`，右值会移动进来；但如果实参是派生类，移动的只是基类部分，派生部分被切片。

`f(const T&)` 的“接受右值”也不保留右值性：绑定之后，函数体里看到的只是一个 `const T&`，无法再选移动构造。

## 6. 为什么函数体里的 `x` 永远是左值

这是理解完美转发最关键的一句话：

> **具名右值引用在表达式里是左值。**

```cpp
void sink(int&)  { std::cout << "lvalue\n"; }
void sink(int&&) { std::cout << "rvalue\n"; }

template <typename T>
void relay_bad(T&& x) {
    sink(x);   // x 是左值
}

template <typename T>
void relay_good(T&& x) {
    sink(std::forward<T>(x));
}
```

调用结果：

```text
relay_bad(i)    → lvalue
relay_bad(42)   → lvalue   ← 右值信息在这里丢了
relay_good(i)   → lvalue
relay_good(42)  → rvalue
```

`x` 的**声明类型**是 `T&&`，但表达式 `x` 的**值类别**是左值。类型和值类别是两件不同的事：类型决定它能绑定到什么，值类别决定它在下一次重载决议里被当成什么。

语言为什么这样规定？因为安全。假设具名右值引用在表达式里是右值，那么：

```cpp
template <typename T>
void f(T&& x) {
    sink(x);          // 第一次“移动”
    std::cout << x;   // 可能打印一个已被搬空的对象
    sink(x);          // 第二次“移动”
}
```

一个还能继续使用的具名变量，不应该因为“它的类型是 `T&&`”就自动被搬走。语言把“我可以被移动”的决定权留给程序员：要么写 `std::move(x)`，明确表示不再需要它；要么写 `std::forward<T>(x)`，表示“按调用者原本给的类别处理”。

这也解释了为什么转发必须**一层一层做**。如果中间隔了两层包装，每一层都要转发一次；漏掉任何一层，右值性就会在那里退化成左值。

```cpp
template <typename T>
void level2(T&& x) { sink(std::forward<T>(x)); }

template <typename T>
void level1(T&& x) { level2(std::forward<T>(x)); }
```

`level1(42)` 能一路走到 `sink(int&&)`，是因为两层都没有把 `T` 丢掉。

## 7. `std::move` 为什么不够

`std::move` 的问题不是“不好用”，而是它与转发解决的是不同的问题。

```cpp
template <typename T>
void relay_move(T&& x) {
    sink(std::move(x));
}

std::string s = "hello";
relay_move(s);              // 编译通过，但 s 被搬走了
std::cout << s << '\n';     // 通常为空；标准只保证“有效但未指定”
```

`relay_move(s)` 推导出 `T = std::string&`，这个信息本来足以判断“实参是左值”；但 `std::move(x)` 完全忽略它，无条件把 `x` 转成 `std::string&&`。调用者只是想把 `s` 传进去看一眼，结果所有权被拿走了。

对比两者的语义：

| 操作                 | 结果类型                                 | 含义                                         |
| -------------------- | ---------------------------------------- | -------------------------------------------- |
| `std::move(x)`       | `std::remove_reference_t<decltype(x)>&&` | 无条件当作右值，表示“我不再需要 `x`”         |
| `std::forward<T>(x)` | `T&&`（折叠后）                          | 有条件：`T` 是左值引用就还原为左值，否则右值 |

`std::move` 不携带“调用者原本给的是什么”这一信息；`std::forward<T>` 则把这份信息编码在模板参数 `T` 里。所以 `std::forward` 不是“更聪明的 `std::move`”，`std::move` 也不是“更快的 `std::forward`”——它们的区别在于**有没有 `T` 这个类型证据**。

再看一个容易被忽略的细节：`std::move` 作用在 `const` 对象上，得到的是 `const T&&`，无法绑定到 `T&&` 类型的移动构造函数，最终仍然走拷贝。

```cpp
const std::string cs = "hello";
std::string t = std::move(cs);   // 拷贝，不是移动
```

## 8. `std::forward` 的实现

`std::forward` 在 `<utility>` 里，标准库实现大致如下（这里用 C++14 之后的写法）：

```cpp
template <typename T>
constexpr T&& forward(std::remove_reference_t<T>& t) noexcept {
    return static_cast<T&&>(t);
}

template <typename T>
constexpr T&& forward(std::remove_reference_t<T>&& t) noexcept {
    static_assert(!std::is_lvalue_reference_v<T>,
                  "T 是左值引用类型，不能把右值转发成左值");
    return static_cast<T&&>(t);
}
```

整个函数只有一行有效代码：`static_cast<T&&>(t)`。理解它需要把前面两块知识拼起来。

### 8.1 两次调用的完整推导

假设 `relay_good` 的调用如下：

```cpp
int i = 0;
relay_good(i);    // T = int&
relay_good(42);   // T = int
```

第一次，`T = int&`：

1. 调用 `std::forward<int&>(x)`。
2. 形参类型是 `remove_reference_t<int&>&`，即 `int&`，绑定到具名变量 `x`。
3. 返回类型是 `int& &&`，引用折叠为 `int&`。
4. 返回 `static_cast<int&>(x)`，这是一个左值。
5. `sink` 选中 `sink(int&)`。

第二次，`T = int`：

1. 调用 `std::forward<int>(x)`。
2. 形参类型是 `remove_reference_t<int>&`，即 `int&`，同样绑定到 `x`。
3. 返回类型是 `int&&`。
4. 返回 `static_cast<int&&>(x)`，这是一个将亡值。
5. `sink` 选中 `sink(int&&)`。

整理成表：

| 调用             | `T`    | `forward<T>` 的返回类型 | 结果值类别 | 选中的重载    |
| ---------------- | ------ | ----------------------- | ---------- | ------------- |
| `relay_good(i)`  | `int&` | `int&`                  | 左值       | `sink(int&)`  |
| `relay_good(42)` | `int`  | `int&&`                 | 将亡值     | `sink(int&&)` |

条件分支并不存在于 `std::forward` 的代码里，而是存在于**引用折叠**里：`T` 是左值引用时，`T&&` 折叠回左值引用；`T` 是值类型时，`T&&` 保持右值引用。

### 8.2 为什么形参是 `remove_reference_t<T>&`

`remove_reference_t<T>` 的作用不只是“把引用去掉”，更重要的是把 `T` 放进**非推导语境**。调用 `std::forward(x)` 时，编译器无法从实参反推 `T`，只能由调用者显式写出 `std::forward<T>(x)`，把调用点的 `T` 原样带进来。如果形参直接写成 `T&` 和 `T&&`，编译器会从 `x` 重新推导 `T`；而 `x` 在函数体里永远是左值，推导只看得到“左值”这一件事，调用点原本的右值信息在这一步就丢了。

剥掉引用之后，两个重载的分工也很清楚：

- 第一个重载的参数是 `X&`，接受左值。
- 第二个重载的参数是 `X&&`，只接受右值。

第二个重载处理的是“把右值转发成右值”的情况，同时用 `static_assert` 拦住“把右值转发成左值”这种危险操作：

```cpp
std::forward<int&>(std::move(x));   // 编译错误：不能把右值转发成左值
```

如果没有这个检查，`std::forward<int&>` 会返回一个指向 `x` 的左值引用；如果 `x` 绑定的是一个即将销毁的临时对象，这个引用马上就会悬垂。

### 8.3 为什么不能省略模板实参

因为 `T` 处于非推导语境，下面这种写法无法编译：

```cpp
std::forward(x);   // 错误：无法推导 T
```

必须显式写出：

```cpp
std::forward<T>(x);
```

在泛型 lambda 里没有名字叫 `T` 的模板参数，通常写成：

```cpp
std::forward<decltype(x)>(x);
```

这里的 `decltype(x)` 是参数的声明类型：实参是左值时它是 `A&`，实参是右值时它是 `A&&`。不要写成 `decltype((x))`，那会得到 `A&`，左值实参和右值实参都会被转发成左值。

### 8.4 和手写 `static_cast` 的关系

对于转发引用，下面两种写法在语义上完全等价：

```cpp
sink(std::forward<T>(x));
sink(static_cast<T&&>(x));
```

`std::forward` 的价值在于：名字直接表达了意图，带 `noexcept`，并且用第二个重载挡住误用。编译器会把它内联掉，不会产生运行时开销。

### 8.5 `std::move` 的实现

作为对照，`std::move` 的实现是：

```cpp
template <typename T>
constexpr std::remove_reference_t<T>&& move(T&& t) noexcept {
    return static_cast<std::remove_reference_t<T>&&>(t);
}
```

它的参数也是转发引用，但它不做条件判断，而是先把 `T` 上的引用去掉，再统一加上 `&&`。因此无论传入左值还是右值，返回的都是右值引用。这也是为什么 `std::move` 既能接受左值、也能接受右值，而 `std::forward` 只应该用在转发引用的参数上。

## 9. 完美转发的典型场景

### 9.1 重新实现 `make_unique`

`std::make_unique` 是完美转发最标准的示例：

```cpp
#include <memory>
#include <utility>

template <typename T, typename... Args>
std::unique_ptr<T> make_unique(Args&&... args) {
    return std::unique_ptr<T>(new T(std::forward<Args>(args)...));
}
```

`Args&&...` 是一包转发引用，每个实参对应一个 `Args`；`std::forward<Args>(args)...` 按参数包展开，把每个实参按原本的值类别交给 `T` 的构造函数。

```cpp
auto p = make_unique<std::string>(3, 'x');   // "xxx"
```

这里 `3` 和 `'x'` 都是右值，被原样转发给 `std::string(size_type, char)`。如果写成 `const Args&...`，虽然也能构造，但无法把 `std::unique_ptr` 这类只能移动的参数传进去。

### 9.2 `emplace_back`

```cpp
std::vector<std::string> v;
std::string s = "hello";

v.push_back(s);              // 拷贝
v.push_back(std::move(s));   // 移动
v.emplace_back(3, 'x');      // 直接在 vector 的存储里构造 "xxx"
```

`emplace_back(Args&&...)` 把参数转发给分配器的 `construct`，最终用 placement new 在容器的内存里直接构造对象。整个过程没有临时的 `std::string`，也没有额外的移动。

不过 `emplace_back` 不是 `push_back` 的无条件替代品：

- 它使用直接初始化，会调用 `explicit` 构造函数。
- 它不能直接接受花括号列表：`v.emplace_back({1, 2, 3})` 无法推导 `Args`。如果元素类型本身能由 `initializer_list` 构造，可以显式写出列表类型；更常见的做法是先构造元素对象，再传给 `push_back` 或 `emplace_back`。
- 如果手里已经有一个 `std::string`，`push_back(std::move(s))` 和 `emplace_back(std::move(s))` 的成本基本相同。

### 9.3 泛型包装器

转发引用也常用于“在调用前后做点什么”的包装器：

```cpp
#include <functional>
#include <iostream>
#include <utility>

template <typename F, typename... Args>
decltype(auto) logged_call(const char* name, F&& f, Args&&... args) {
    std::cout << "-> " << name << '\n';
    return std::invoke(std::forward<F>(f), std::forward<Args>(args)...);
}

int add(int a, int b) { return a + b; }

int main() {
    auto sum = logged_call("add", add, 1, 2);
    std::cout << sum << '\n';
}
```

这里有两个细节：

- `std::invoke` 统一处理普通函数、函数对象和成员函数指针，包装器不需要为它们分别写重载。
- 返回类型用 `decltype(auto)` 而不是 `auto`。如果被包装的函数返回 `T&`，`decltype(auto)` 会保留引用；写成 `auto` 则会复制一份。

### 9.4 泛型 lambda

C++14 起，lambda 的参数可以写 `auto&&`，它等价于一个带 `T&&` 参数的函数模板：

```cpp
auto relay = [](auto&& x) {
    sink(std::forward<decltype(x)>(x));
};
```

`decltype(x)` 是 `x` 的声明类型，左值实参时是 `A&`，右值实参时是 `A&&`，正好可以直接交给 `std::forward`。

### 9.5 范围 `for`

```cpp
for (auto&& item : container) {
    process(std::forward<decltype(item)>(item));
}
```

迭代器可能返回左值引用、将亡值，甚至代理对象（例如 `std::vector<bool>` 的 `reference`）。`auto&&` 能把这些都绑定住，`std::forward` 则保留迭代器表达式原本的类别。

这里要区分两件事：`auto&&` 保留的是**迭代器返回表达式**的类别，不是容器本身的类别。即使传入一个右值容器，遍历出来的元素通常仍是左值；想把元素搬走，仍然需要显式 `std::move`，并且要确认容器之后不再使用。

## 10. 十个常见陷阱

### 10.1 花括号列表没有类型

```cpp
template <typename T>
void f(T&&);

f({1, 2, 3});   // 错误：无法推导 T
```

花括号列表不是表达式，没有类型可供推导。显式写出类型即可：

```cpp
f(std::initializer_list<int>{1, 2, 3});
```

不要和下面这行混淆：

```cpp
auto&& x = {1, 2, 3};   // 特殊规则：auto = std::initializer_list<int>
```

`auto` 对花括号列表有专门的处理，但这不是转发引用。

### 10.2 重载函数名无法推导

```cpp
void g(int);
void g(double);

template <typename T>
void f(T&&);

f(g);   // 错误：g 是重载集，T 无法推导
```

重载集没有唯一类型，模板推导无从下手。先确定要哪一个：

```cpp
f(static_cast<void (*)(int)>(g));
```

或者用 lambda 包一层：

```cpp
f([](int x) { return g(x); });
```

函数模板同理，`f(h)` 也无法推导，需要写成 `f(h<int>)` 这样的具体特化。

### 10.3 万能引用不做隐式转换

```cpp
template <typename T>
void f(T&&);

f(0);      // T = int
f(NULL);   // 可能是 int、long 或 std::nullptr_t，取决于实现
f("hi");   // T = const char(&)[3]，不是 std::string
```

普通函数调用会发生数组到指针、`const char*` 到 `std::string` 之类的转换；万能引用是**精确匹配**，实参是什么类型，`T` 就推导成什么类型。需要转换就显式做：

```cpp
f(std::string("hi"));
f(std::string_view("hi"));
f(nullptr);   // T = std::nullptr_t
```

### 10.4 显式模板实参关闭推导

```cpp
int i = 0;

f<int>(i);    // 错误：形参是 int&&，不能绑定左值
f<int&>(i);   // 可以：形参折叠成 int&
```

一旦写了 `f<int>`，`T` 就被固定为 `int`，`T&&` 不再是转发引用，而是普通的右值引用。同理，`std::forward<int>(x)` 会无条件把 `x` 当成右值——这其实就是一次 `std::move`。

### 10.5 万能引用太贪婪

万能引用几乎能精确匹配任何实参，因此在重载集中往往“抢走”本来该由其他重载处理的调用。

```cpp
class Person {
public:
    template <typename T>
    explicit Person(T&& n) : name(std::forward<T>(n)) {}

private:
    std::string name;
};

Person p1("Alice");
Person p2(p1);   // 调用的是模板构造函数，不是拷贝构造函数
```

对于非 const 左值 `p1`，模板推导出 `T = Person&`，形参是 `Person&`；编译器生成的拷贝构造函数参数是 `const Person&`。两者都能精确匹配，但 `Person&` 的 cv 限定更少，引用绑定规则让它更优，于是模板赢了。接着 `std::string` 无法从 `Person&` 构造，编译失败。

如果 `p1` 是 `const Person`，模板推导出 `const Person&`，与拷贝构造函数打平，非模板版本优先，反而能正常工作。这种“const 与否决定编译成败”的行为非常隐蔽。

修法是给模板加约束，把它从拷贝/移动的场景里排除掉：

```cpp
#include <type_traits>

class Person {
public:
    template <typename T,
              typename = std::enable_if_t<
                  !std::is_base_of_v<Person, std::decay_t<T>>>>
    explicit Person(T&& n) : name(std::forward<T>(n)) {}

private:
    std::string name;
};
```

C++20 可以写得更直接：

```cpp
template <typename T>
    requires (!std::is_base_of_v<Person, std::remove_cvref_t<T>>)
explicit Person(T&& n) : name(std::forward<T>(n)) {}
```

同样的道理也适用于普通重载：

```cpp
void handle(const std::string& s);

template <typename T>
void handle(T&& x);

std::string s = "hi";
handle(s);         // 模板赢：T = std::string&，比 const std::string& 更匹配

const std::string cs = "hi";
handle(cs);        // 非模板赢：两者都是 const std::string&，非模板优先
```

原则是：**不要在重载集里放一个没有约束的万能引用**。如果确实需要，用 `enable_if` 或 concepts 把接受范围限制清楚。

### 10.6 转发两次

在同一个函数里，`std::forward` 通常只应该出现一次，并且放在最后一次使用参数的位置：

```cpp
template <typename T>
void f(T&& x) {
    log(x);                        // 只读，安全
    consume(std::forward<T>(x));   // 最后一次使用，之后不再碰 x
}
```

如果写成：

```cpp
consume(std::forward<T>(x));
consume(std::forward<T>(x));   // 第二次可能搬的是一个已经空掉的对象
```

第一次转发可能已经把 `x` 的资源移走，第二次再转发就是对一个“有效但未指定”的对象做移动。移动构造通常仍然能完成，但结果不可依赖。

### 10.7 返回万能引用

```cpp
template <typename T>
T&& identity(T&& x) {
    return std::forward<T>(x);
}

auto&& r = identity(std::string("temp"));   // 悬垂引用
```

`identity` 返回的是引用，而它引用的是调用时创建的临时对象。临时对象在完整表达式结束时销毁，`r` 随即悬垂。`auto&&` 不会延长这里的生命周期——引用绑定延长寿命只适用于**直接绑定到临时对象**，不适用于“函数返回的引用”。

如果目的是返回一个值，就按值返回：

```cpp
template <typename T>
std::decay_t<T> identity(T&& x) {
    return std::forward<T>(x);
}
```

或者直接写 `auto`，让返回值类型自然退化。只有在确实要返回调用者对象内部的引用时，才应该返回引用，并且要确保那个对象的生命周期覆盖调用者。

### 10.8 const 会被原样转发

```cpp
const std::string cs = "hello";
std::vector<std::string> v;

v.emplace_back(cs);   // 转发为 const std::string&，拷贝
```

这不是转发失败，而是转发**太忠实**：`const` 被保留了下来，`std::string` 的移动构造函数接受 `std::string&&`，无法绑定 `const std::string&&`，于是只能拷贝。移动一个 `const` 对象本来就不可能；如果对象最初就定义为 `const`，用 `const_cast` 去掉 const 再去修改它属于未定义行为。

### 10.9 完美转发会丢掉拷贝消除

```cpp
template <typename T, typename... Args>
T make(Args&&... args) {
    return T(std::forward<Args>(args)...);
}

auto s = make<std::string>(std::string("hi"));
```

C++17 的保证拷贝消除（guaranteed copy elision）适用于“用纯右值直接初始化对象”的场景。但在这里，实参 `std::string("hi")` 先被物化成临时对象，绑定到 `Args&&`；进入函数后，`std::forward` 把它变成将亡值，最终选中 `std::string` 的移动构造函数。结果是一次移动，而不是零次。

移动通常很便宜，但这说明“完美转发”并不等于“零开销”：它保证不产生**额外的复制**，不保证消除所有移动。如果对构造次数极其敏感，直接构造对象往往比经过一层工厂更划算。

### 10.10 同一个 T 出现在多个参数上

```cpp
template <typename T>
void f(T&& a, T&& b);

int i = 0;
f(i, 1);   // 错误：T 同时被推导为 int& 和 int
```

两个参数共享同一个 `T`，推导结果必须一致。左值 `i` 要求 `T = int&`，右值 `1` 要求 `T = int`，矛盾。

修法是让每个参数有独立的模板参数：

```cpp
template <typename T, typename U>
void f(T&& a, U&& b);
```

如果确实需要两个参数同类型，就在调用处显式统一：

```cpp
f<int&>(i, i);   // 两个都是 int&
```

## 11. 什么时候该用万能引用

万能引用很强大，但不应该成为所有参数的默认写法。选择参数形式时，先问清楚函数的语义。

| 参数写法          | 语义                     | 代价                       | 适用场景                             |
| ----------------- | ------------------------ | -------------------------- | ------------------------------------ |
| `T`               | 函数持有一份独立的值     | 左值复制一次，右值移动一次 | 小对象、需要修改副本、可复制类型     |
| `const T&`        | 只读观察，不持有         | 无复制                     | 只读查询、日志、不需要保留值类别     |
| `T&&`（具体类型） | 只接受右值，通常表示接管 | 移动                       | 移动构造、sink 接口、容器操作        |
| `T&&`（万能引用） | 原样转发给下游           | 由下游决定                 | 工厂、包装器、`emplace` 一类基础设施 |

几条实践建议：

- **普通业务接口先写清楚语义**。只读就用 `const T&` 或 `std::string_view`，要持有就用值或具体的 `T&&`。不要为了“看起来高效”把每个参数都写成 `T&&`。
- **泛型转发层才用万能引用**。工厂、包装器、`emplace_back` 这类函数不知道下游需要什么，才需要把选择权交出去。
- **构造函数里的万能引用一定要约束**。否则它会和拷贝/移动构造函数竞争，出现 10.5 节那种情况。
- **模板写在头文件里**。转发引用会为每组实参类型生成一个特化，增加编译时间和二进制体积；接口边界要克制。
- **只读字符串参数优先考虑 `std::string_view`**（C++17），但要确认它指向的字符数组生命周期足够长。

## 12. C++20/23 的补充

### 12.1 用 concepts 约束转发引用

C++20 的 concepts 可以让约束写在签名旁边，错误信息也比 `enable_if` 清楚：

```cpp
#include <concepts>
#include <type_traits>

template <typename T>
    requires std::integral<std::remove_cvref_t<T>>
void f(T&& x) {
    // ...
}
```

这里必须用 `remove_cvref_t`：左值 `int` 传给 `T&&` 时，`T` 推导为 `int&`，而 `std::integral<int&>` 是 `false`。约束要作用在去掉引用和 cv 之后的类型上。

### 12.2 `std::forward_like`

C++23 增加了 `std::forward_like`，用于把**外层对象**的值类别和 const 限定传给它的成员：

```cpp
#include <string>
#include <utility>

struct Widget {
    std::string name;

    template <typename Self>
    auto&& get(this Self&& self) {
        return std::forward_like<Self>(self.name);
    }
};
```

当 `Widget` 对象是左值时，`get()` 返回 `std::string&`；当对象是右值时，返回 `std::string&&`；`const` 也会一并传播。它解决的是“成员访问丢失外层值类别”的问题，和普通函数参数的转发是两件事。日常写转发时，仍然以 `std::forward<T>` 为主。

## 13. 速查表

| 现象                    | 原因                                  | 修法                                         |
| ----------------------- | ------------------------------------- | -------------------------------------------- |
| 包装函数总是拷贝        | 参数是 `const T&`，或函数体直接传 `x` | 改成 `T&&`，并用 `std::forward<T>(x)` 向下传 |
| 左值被搬空              | 在转发引用上用了 `std::move`          | 改用 `std::forward<T>`                       |
| `f({1, 2, 3})` 编译失败 | 花括号列表没有类型                    | 显式构造 `std::initializer_list`             |
| `f(g)` 编译失败         | `g` 是重载集，无法推导                | 转成具体函数指针，或用 lambda 包一层         |
| 拷贝构造被模板抢走      | 万能引用比 `const Person&` 更匹配     | 用 `enable_if` 或 concepts 约束模板          |
| 返回的引用悬垂          | 返回了 `T&&`，引用了临时对象          | 按值返回，或确保被引用对象活得足够久         |
| 转发后对象可能为空      | 转发之后又使用了参数                  | 转发只做一次，放在最后一次使用               |
| `f<int>(i)` 编译失败    | 显式模板实参关闭了推导                | 去掉显式实参，或写 `f<int&>(i)`              |

最后把核心结论压缩成六句话：

1. `T&&` 只有在**调用点推导**且**形参正好是 `T&&`** 时才是万能引用；`const T&&`、类模板成员、显式 `f<int>` 都不是。
2. 引用折叠只有 `&& &&` 得到 `&&`，其余组合都得到 `&`；这是 `T&&` 能同时接受左值和右值的根本原因。
3. 左值实参推导出 `T = A&`，右值实参推导出 `T = A`；`T` 本身可以是引用类型。
4. 具名变量在表达式里永远是左值，`T&& x` 里的 `x` 也不例外。
5. `std::move` 是无条件转右值，`std::forward<T>` 按 `T` 有条件还原；转发场景只能用后者。
6. 转发只做一次，放在最后一次使用参数的位置；返回 `T&&` 之前先确认生命周期。

所谓“完美”，指的是类型、const 和值类别三样信息都被完整保留，下游看到的就是调用者写下的。它不承诺零拷贝，也不承诺零移动；它承诺的是**不因为多了一层包装而改变语义**。把这套机制拆开看，无非是推导、折叠和一次有条件的类型转换——难点不在实现，而在每个边界上都要记得把它接上。

## 参考与延伸阅读

- [std::forward - cppreference](https://en.cppreference.com/w/cpp/utility/forward)
- [Reference declaration（引用折叠与转发引用）- cppreference](https://en.cppreference.com/w/cpp/language/reference)
- [Template argument deduction - cppreference](https://en.cppreference.com/w/cpp/language/template_argument_deduction)
- [C++ 标准草案 [temp.deduct.call]](https://eel.is/c++draft/temp.deduct.call)
- [Universal References in C++11 - Scott Meyers](https://isocpp.org/blog/2012/11/universal-references-in-c11-scott-meyers)
- 《Effective Modern C++》第 24、25、26、28 条，Scott Meyers
