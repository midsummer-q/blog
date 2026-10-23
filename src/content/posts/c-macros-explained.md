---
author: midsummer-q
pubDatetime: 2026-10-23T00:00:00Z
title: C 语言宏讲透：从展开规则到 do while (0)，再到实用技巧
featured: false
draft: false
tags:
  - C语言
  - 预处理器
  - 系统级编程
series:
  name: 计算机底层与设计哲学
  order: 7
description: 从预处理后的代码理解 C 语言宏，逐步拆解括号、重复求值、do while (0)、字符串化、标记拼接、可变参数与 X-Macro，并用可运行实验验证常见陷阱和使用边界。
---

第一次看到下面这段代码时，很容易觉得它多此一举：

```c
#define APP_REPORT(value)              \
    do {                               \
        printf("value=%d\n", (value));  \
        fflush(stdout);                \
    } while (0)
```

循环条件永远是假，为什么还要写循环？直接放两条语句不行吗？加一对大括号又有什么问题？

要回答这些问题，先记住一个判断方法：**遇到宏，先把它展开，再按普通 C 代码分析。** 宏的许多“怪脾气”，都来自我们把它看成了函数，而编译器看到的是另一段代码。

本文先从基础展开规则讲起，再讲工程中常见的技巧。主体以 **C11/C17** 为基线；C23 和 GNU 扩展会单独标明。涉及输出的示例采用小整数，避免让整数溢出干扰讨论。末尾提供一份[可下载的完整实验程序](/blog/examples/c-macros/macro-lab.c)。

写作前参考了 Simon Pantzare 的 [do-while 宏文章](https://pilt.github.io/2009/10/16/the-use-of-do-while-0-in-c-macros/)、Paul J. Lucas 的 [C/C++ Preprocessor Macros](https://dev.to/pauljlucas/cc-preprocessor-macros-fh5)，以及 Simon Tatham 的 [Coroutines in C](https://www.chiark.greenend.org.uk/~sgtatham/coroutines.html)。前两篇适合理解基本机制，后一篇适合看宏能怎样改变代码结构。下面使用重新设计的小例子展开说明，语言规则以 GCC 文档和 WG14 草案交叉核对。

## Table of contents

## 1. 宏到底在什么时候起作用？

可以先把构建过程简化为：

```text
源代码 + 头文件
      │
      ▼
预处理：包含头文件、条件编译、展开宏
      │
      ▼
编译：对展开后的 C 代码进行语法和类型检查
      │
      ▼
汇编、链接 → 可执行程序
```

这是一幅帮助理解的流程图，现代编译器不一定把每一步做成独立进程。

### 对象式宏：给一串标记起名字

```c
#define APP_CAPACITY 32

int queue[APP_CAPACITY];
```

展开后相当于：

```c
int queue[32];
```

`APP_CAPACITY` 本身不是变量，没有“宏自己的地址”。展开得到的 `32` 是有类型的 C 整数常量，但预处理器不负责像函数参数那样检查类型。

也不要把宏理解成编辑器的任意字符串替换。它操作的是 **预处理标记（preprocessing token）**：标识符、数字、运算符等。

```c
#define APP_CAPACITY 32

int APP_CAPACITY_LIMIT = 64;  // 不会替换标识符的一部分
puts("APP_CAPACITY");         // 字符串内部也不会展开
```

### 函数式宏：替换参数，而不是先传值

```c
#define APP_DOUBLE(x) ((x) + (x))

int n = APP_DOUBLE(3 + 4);
```

展开结果是：

```c
int n = ((3 + 4) + (3 + 4));
```

这里没有“先算出 7，再把 7 传进一个函数”的过程；参数对应的标记被放进了宏体。

定义时，宏名与左括号之间不能有空白：

```c
#define APP_DOUBLE(x) ((x) + (x))  // 函数式宏
#define APP_OTHER (x) ((x) + (x))  // 对象式宏，替换内容从 (x) 开始
```

调用函数式宏时则允许空白，例如 `APP_DOUBLE (3)`。多行宏靠行末的 `\` 续行；为保证可移植性，让反斜杠紧接换行，不要在它后面追加空格或注释。对象式宏、函数式宏和标记规则可从 [GCC 的宏文档](https://gcc.gnu.org/onlinedocs/cpp/Macros.html)继续查阅。

## 2. 为什么参数和整个表达式都要加括号？

先看一个没有保护的平方宏：

```c
#define APP_SQUARE_BAD(x) x * x

int n = APP_SQUARE_BAD(2 + 3);
```

它展开成 `2 + 3 * 2 + 3`，结果是 `11`，而不是 `25`。因此，作为表达式使用的每个参数都应有括号：

```c
#define APP_SQUARE_HALF(x) (x) * (x)
```

但这还不够：

```c
int n = 100 / APP_SQUARE_HALF(5);
// 展开：100 / (5) * (5)
// 结果：100，而不是 4
```

还需要给整个结果加括号：

```c
#define APP_SQUARE(x) ((x) * (x))
```

两层括号保护的是两个不同的边界：

| 括号位置               | 保护什么               | 防止什么                     |
| ---------------------- | ---------------------- | ---------------------------- |
| 每次出现的表达式参数外 | 调用者传进来的表达式   | `2 + 3` 被宏里的乘法拆开     |
| 整个宏表达式外         | 宏与调用者上下文的关系 | 外面的除法先与宏的一部分结合 |

这是 **表达式宏** 的规则，不是让你把所有宏参数机械地括起来。参数若代表类型名、结构体成员名，或者正在参与 `#`、`##` 操作，应按对应语法处理。优先级问题的官方说明见 [GCC：Operator Precedence Problems](https://gcc.gnu.org/onlinedocs/cpp/Operator-Precedence-Problems.html)。

## 3. 括号齐全，为什么还是会出错？

### 重复求值：一次调用可能执行两次操作

```c
#define APP_MIN(a, b) ((a) < (b) ? (a) : (b))

int i = 3;
int result = APP_MIN(i++, 10);
```

展开成：

```c
int result = ((i++) < (10) ? (i++) : (10));
```

先用旧值 `3` 比较，随后 `i` 变成 `4`；条件为真，再执行选中的 `i++`，表达式取值为 `4`，最后 `i` 变成 `5`。因此 `result == 4`、`i == 5`。

这里 **不是未定义行为**：条件运算符先完成第一个操作数的求值，再求值被选中的分支。问题是同一个实参意外执行了两次。函数调用、读取硬件寄存器、昂贵的计算，同样可能因为重复展开而出问题。参见 [GCC：Duplication of Side Effects](https://gcc.gnu.org/onlinedocs/cpp/Duplication-of-Side-Effects.html)。

### 未定义行为：连“固定输出”都不能讨论

下面这个例子性质不同：

```c
int i = 3;
int result = APP_SQUARE(i++);
// 展开：((i++) * (i++))
```

乘法两侧对同一个 `i` 的修改没有规定先后关系，在 C11/C17 中产生未定义行为。不能拿某一次运行得到的数字当作答案，也不能说“必然先算左边”。

实际写代码时，最直接的修复通常是函数：

```c
static inline int app_square_int(int x)
{
    return x * x;
}
```

`app_square_int(i++)` 只对这个实参求值一次。不过 `app_add(i++, i++)` 这种写法仍然有问题：C11/C17 的函数调用也不保证各实参之间的求值次序，不能通过改成函数让这两个修改变安全。

若必须使用原宏，就先把有副作用的操作拆出来：

```c
int value = i++;
int result = APP_SQUARE(value);
```

注意，普通 `int` 的平方仍可能溢出。宏换成函数解决的是接口与求值问题，不会自动扩大数值范围。

## 4. do { ... } while (0) 到底解决什么？

它的核心作用是：**让多条语句组成一个可在调用处以分号结束的语句。** 按三个版本展开一次，就不需要死记了。

### 第一版：直接写两条语句

```c
#define APP_REPORT_BAD(value) \
    printf("value=%d\n", (value)); \
    fflush(stdout)

if (enabled)
    APP_REPORT_BAD(7);
```

展开后：

```c
if (enabled)
    printf("value=%d\n", (7));
fflush(stdout);
```

`if` 只控制第一条语句。即使 `enabled` 为假，`fflush` 仍然执行。

### 第二版：加大括号

```c
#define APP_REPORT_BLOCK(value) { \
    printf("value=%d\n", (value)); \
    fflush(stdout); \
}
```

大括号把两条语句组合起来了。但常见的调用方式会引入新问题：

```c
if (enabled)
    APP_REPORT_BLOCK(7);
else
    puts("disabled");
```

展开后：

```c
if (enabled) {
    printf("value=%d\n", (7));
    fflush(stdout);
};  // 这里多出来的分号是一条空语句
else
    puts("disabled");
```

`if` 的受控语句已经在 `}` 结束，紧跟的空语句又隔在 `else` 前面，语法就不成立了。

### 第三版：用 do-while 包装

```c
#define APP_REPORT(value)              \
    do {                               \
        printf("value=%d\n", (value));  \
        fflush(stdout);                \
    } while (0)

if (enabled)
    APP_REPORT(7);
else
    puts("disabled");
```

这次展开为：

```c
if (enabled)
    do {
        printf("value=%d\n", (7));
        fflush(stdout);
    } while (0);
else
    puts("disabled");
```

调用者写的分号，恰好成为 `do ... while (0);` 语法的一部分。整个宏现在是一条语句，`else` 也能正常匹配。

`do` 先进入循环体，再检查条件；条件是 `0`，所以没有第二轮。正常顺序执行时，循环体执行一次。**定义末尾不要自带分号，分号留给调用者。** 这与普通函数调用的书写习惯一致。Simon Pantzare 的文章按失败版本逐步推导这一点；GCC 也专门用 [Swallowing the Semicolon](https://gcc.gnu.org/onlinedocs/cpp/Swallowing-the-Semicolon.html) 说明它。

### 它不是“宏安全开关”

`do-while` 包装只解决语句组织和局部块作用域，不能修复所有问题：

- 宏体如果使用实参两次，仍然可能求值两次。
- 它是语句，不能写成 `int n = APP_REPORT(7);`。
- 宏体中的 `return` 会返回调用者所在的函数。
- 宏体中直接出现的 `break` 会结束这层 `do`；直接出现的 `continue` 会跳到这层 `do` 的条件检查，然后退出它。若宏里还有更内层的循环或 `switch`，则按普通 C 的最近匹配规则判断。

例如：

```c
#define APP_SKIP_IF_ZERO(x) \
    do {                   \
        if ((x) == 0)      \
            continue;      \
    } while (0)

for (int i = 0; i < 2; ++i) {
    APP_SKIP_IF_ZERO(i);
    printf("%d\n", i);
}
```

输出仍是 `0`、`1`。这个 `continue` 不会跳过外层 `for` 后面的 `printf`。宏如果把控制流藏得太深，就很难从调用处看懂；[Linux 内核编码规范第 12 节](https://docs.kernel.org/process/coding-style.html#macros-enums-and-rtl)也特别提醒避免这类接口。

## 5. #：把“你写了什么”变成字符串

普通函数拿到表达式的值，通常不知道调用者写的是 `count` 还是 `left + right`。宏的字符串化可以保留实参的写法：

```c
#define APP_TRACE_INT(expr) \
    do { \
        printf("%s = %d\n", #expr, (expr)); \
    } while (0)

int left = 4;
int right = 5;
APP_TRACE_INT(left + right);
```

展开的核心是：

```c
printf("%s = %d\n", "left + right", (left + right));
```

于是输出 `left + right = 9`。字符串化那一次不执行表达式，后面的 `(expr)` 才求值。这一示例限定表达式类型适配 `%d`，不能随意传 `double` 或 `size_t`。

这里的 `#expr` 是宏替换列表里的字符串化运算符，和指令开头的 `#define` 不是同一种用法。它保留的是标记拼写，前后空白会去掉，内部连续空白会归一化；注释此前已被处理。规则见 [GCC：Stringizing](https://gcc.gnu.org/onlinedocs/cpp/Stringizing.html)。

### 为什么经常要写两层宏？

```c
#define APP_VERSION 42
#define APP_STR_RAW(x) #x
#define APP_STR(x) APP_STR_RAW(x)

APP_STR_RAW(APP_VERSION)  // "APP_VERSION"
APP_STR(APP_VERSION)      // "42"
```

直接参与 `#` 的参数不会先展开，所以第一行得到名字。第二行在外层没有直接使用 `#`，先把 `APP_VERSION` 展开为 `42`，再传进内层字符串化。

```text
APP_STR(APP_VERSION)
    → APP_STR_RAW(42)
    → "42"
```

口诀可以记成：**内层负责操作，外层负责先展开参数。**

## 6. ##：拼的是标记，不是运行时字符串

```c
#define APP_CAT_RAW(a, b) a ## b
#define APP_CAT(a, b) APP_CAT_RAW(a, b)

int APP_CAT(sensor_, 7) = 100;
// 相当于：int sensor_7 = 100;
```

它能生成标识符，也能用于生成某些其他合法标记；拼接结果必须合法。不能把任意两个片段硬拼，例如 `APP_CAT_RAW(x, +)` 不会得到一个合法的单一标记。

它也不是连接字符串的工具：

```c
const char *message = "hello, " "world";
```

相邻字符串字面量本来就会连接，不需要 `##`；若是运行时的两个字符数组，则需要相应的字符串处理逻辑。参见 [GCC：Concatenation](https://gcc.gnu.org/onlinedocs/cpp/Concatenation.html)。

### 两层展开同样适用于

```c
#define APP_ID 7

APP_CAT_RAW(sensor_, APP_ID)  // sensor_APP_ID
APP_CAT(sensor_, APP_ID)      // sensor_7
```

与 `#` 类似，在当前替换层直接参与 `##` 的实参不会预先宏展开。两层结构用于先展开再拼接，而拼接后的结果还可以继续被扫描。[GCC：Argument Prescan](https://gcc.gnu.org/onlinedocs/cpp/Argument-Prescan.html)解释了这一过程。

因此也能写：

```c
#define APP_LOCAL_NAME(prefix) APP_CAT(prefix, __LINE__)
```

它可以降低临时名字碰撞的概率，但同一行调用两次会得到相同后缀，不能当作绝对唯一的名字生成器。某些编译器提供 `__COUNTER__` 扩展；本文的 C11/C17 可移植代码不依赖它。

## 7. 宏的展开顺序：够用的三条规则

不必一开始就背完整标准，可以先按下面的顺序分析大多数普通宏：

1. 收集实参；实参内配对的圆括号保护其中的逗号。
2. 普通参数位置先展开实参中的宏；当前层用于 `#` 或 `##` 的位置按特殊规则处理。
3. 替换完成后重新扫描结果，继续展开符合条件的宏。

这不等于“无限递归展开”。正在展开的宏不会在自己的展开链上无休止地调用自己：

```c
#define APP_SELF APP_SELF
```

预处理不会因此死循环；如果最终的 `APP_SELF` 留在需要 C 表达式的位置，又没有相应声明，后续编译依然会报错。细节见 [GCC：Self-Referential Macros](https://gcc.gnu.org/onlinedocs/cpp/Self-Referential-Macros.html)。

### 逗号为什么会突然变成两个参数？

```c
#define APP_PAIR 10, 20
#define APP_FIRST(x) APP_SECOND(x)
#define APP_SECOND(x) (x)

APP_FIRST(APP_PAIR)
```

外层最初收到一个参数 `APP_PAIR`，但它展开后变成 `10, 20`，于是重新扫描到的是 `APP_SECOND(10, 20)`：内层只收一个参数，这就报错了。

结构体复合字面量也有类似的坑。预处理器划分实参时，**圆括号保护逗号，大括号本身不保护逗号**：

```c
struct point { int x, y; };
#define APP_POINT_X(p) ((p).x)

// 错误示意：大括号里的逗号会被当作宏参数分隔符
// APP_POINT_X((struct point){1, 2})

int x = APP_POINT_X(((struct point){1, 2}));
```

再加一层圆括号，是为了让整个复合字面量在预处理时保持为一个参数。宏的参数解析只认识这些标记规则，不会替你先理解结构体初始化语法。

## 8. 可变参数宏：把日志写得好用一点

### C99 起就能用的写法

让整个格式化调用都进入 `...`，可以避免“可选参数为空时多出一个逗号”的麻烦：

```c
#include <stdio.h>

#define APP_LOG(...) \
    do { \
        fprintf(stderr, "[%s:%d] ", __FILE__, __LINE__); \
        fprintf(stderr, __VA_ARGS__); \
        fputc('\n', stderr); \
    } while (0)

APP_LOG("started");
APP_LOG("count=%d", 3);
```

这里要求至少提供格式字符串。`__VA_ARGS__` 代表传入的整个可变参数序列；第二个调用最终执行的是 `fprintf(stderr, "count=%d", 3)`。

`__FILE__` 和 `__LINE__` 在展开处提供文件名与行号。函数名可使用 C99 的 `__func__`，但它是函数体内的预定义标识符，**不是预处理宏**。这一日志示例为了教学拆成三次输出；多线程使用时消息可能交错，正式日志库还需要同步和输出策略。

### C23：用 **VA_OPT** 处理可选逗号

如果想把格式字符串单独命名：

```c
#define APP_LOG23(fmt, ...) \
    fprintf(stderr, fmt __VA_OPT__(,) __VA_ARGS__)

APP_LOG23("started\n");
APP_LOG23("count=%d\n", 3);
```

可变参数展开后非空时，`__VA_OPT__(,)` 保留逗号；为空时不产生逗号。这是 **C23** 的能力，见 [WG14 N3096 草案 §6.10.4.1](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3096.pdf)。不要把“某个编译器在旧标准模式也接受”理解为“C11 标准支持”。

老代码还可能写 `, ##__VA_ARGS__` 来吞掉逗号，这是 GNU 扩展的特殊规则，不是普通 `##` 的通用能力。兼容边界见 [GCC：Variadic Macros](https://gcc.gnu.org/onlinedocs/cpp/Variadic-Macros.html)。

### 禁用日志时，别顺手禁用了业务

```c
#if APP_DEBUG
#define APP_DEBUG_LOG(...) APP_LOG(__VA_ARGS__)
#else
#define APP_DEBUG_LOG(...) do { } while (0)
#endif
```

如果写 `APP_DEBUG_LOG("id=%d", next_id())`，禁用日志后 `next_id()` 也不会执行。正确做法是把必要操作独立出来，再记录结果。`assert(i++ > 0)` 同样不合适：定义 `NDEBUG` 后，断言表达式不会求值。断言用于检查，不要依赖它完成业务步骤。

## 9. 条件编译、头文件保护和数组长度

### #ifdef 判断存在，#if 判断值

```c
#define APP_DEBUG 0

#ifdef APP_DEBUG
// 会保留：这个宏已经定义了
#endif

#if APP_DEBUG
// 不会保留：展开后的值是 0
#endif
```

对数值开关，通常先给默认值，再判断：

```c
#ifndef APP_DEBUG
#define APP_DEBUG 0
#endif

#if APP_DEBUG
/* 调试代码 */
#endif
```

编译时可以用 `gcc -DAPP_DEBUG=1 ...` 覆盖默认值。`#if` 中普通的未定义标识符会被当作 `0`，拼错开关名可能悄悄关闭功能；GCC 的 `-Wundef` 有助于发现它。

不要拿 C 的 `enum` 名称或变量去给 `#if` 判断，它发生在 C 语义分析之前；这里也不能用 `sizeof(int)` 查询类型大小。参见 [GCC：If](https://gcc.gnu.org/onlinedocs/cpp/If.html)。

### 头文件保护：避免重复包含

```c
#ifndef APP_SENSOR_H_INCLUDED
#define APP_SENSOR_H_INCLUDED

int app_read_sensor(void);

#endif
```

宏没有 C 的块作用域：即使把 `#define` 写在函数体中，它通常也会影响同一翻译单元后续的预处理，直到 `#undef` 或文件处理结束。头文件宏因此要有项目前缀，辅助宏用完及时 `#undef`。不要自行使用双下划线开头、或下划线加大写字母开头等保留名称。

### 数组长度：简洁，但不是万能

```c
#define APP_ARRAY_LEN(a) (sizeof(a) / sizeof((a)[0]))

int values[] = {10, 20, 30};
printf("%zu\n", APP_ARRAY_LEN(values));  // 3
```

前提是 `a` 仍是数组。如果传入指针，分子就变成指针大小：

```c
void inspect(int values[])
{
    // 形参里的 values 实际是 int *，这里不能用 APP_ARRAY_LEN 求元素数
}
```

这个简单宏不会可靠地拒绝指针误用，接口仍应显式传入长度。普通非变长数组的 `sizeof` 不求值其操作数；涉及变长数组时有额外规则，不要把“sizeof 永远不执行表达式”当成通则。

## 10. X-Macro：一份列表生成多处一致的代码

想象你维护一个状态枚举和对应的名称函数。每增加一个状态，都要改两处；漏改其中一处，就会不一致。

X-Macro 的思路是把事实只写一次，把“如何使用这些事实”交给另一层宏：

```c
#define APP_STATUS_LIST(X) \
    X(IDLE, 0)             \
    X(RUNNING, 1)          \
    X(FAILED, 2)

#define APP_STATUS_ENUM(name, value) APP_STATUS_##name = value,
enum app_status {
    APP_STATUS_LIST(APP_STATUS_ENUM)
};
#undef APP_STATUS_ENUM

static const char *app_status_name(enum app_status status)
{
    switch (status) {
#define APP_STATUS_CASE(name, value) case APP_STATUS_##name: return #name;
        APP_STATUS_LIST(APP_STATUS_CASE)
#undef APP_STATUS_CASE
    default:
        return "UNKNOWN";
    }
}

#undef APP_STATUS_LIST
```

第一轮展开把每个条目变成枚举成员：

```c
enum app_status {
    APP_STATUS_IDLE = 0,
    APP_STATUS_RUNNING = 1,
    APP_STATUS_FAILED = 2,
};
```

第二轮把同一份列表变成 `case` 分支。此后增加一个状态，只需修改列表；枚举与名称函数随之更新。

这不是新的 C 语法，只是“列表宏接收另一个宏名作为参数”，配合 `#` 和 `##` 使用。注意这里生成的是声明或 `case` 片段，不能一律套 `do-while`。

适合它的场景包括错误码、协议字段、命令表等小型规则表。若列表开始夹杂大量业务分支、条件和特殊处理，独立的数据表或代码生成脚本通常更清楚。追求的是减少需要同步维护的地方，而不是把能看懂的代码压成最短。

## 11. 进阶：有临时变量的宏也会“撞名字”

有人会把交换操作写成：

```c
#define APP_SWAP_INT(a, b) \
    do {                  \
        int temp = (a);   \
        (a) = (b);        \
        (b) = temp;       \
    } while (0)
```

看起来既有局部变量，又有 `do-while`。但如果调用者恰好写：

```c
int temp = 1;
int other = 2;
APP_SWAP_INT(temp, other);
```

展开后会出现 `int temp = (temp);`。初始化器里的 `temp` 已经指向刚声明的内层变量，不是外层变量。这就是名字捕获。换成长一点的项目专用名字只能降低风险，不能把普通 C 宏变成自动隔离标识符的“卫生宏”。

而且 `(a)`、`(b)` 在这个宏中各出现多次，`APP_SWAP_INT(values[i++], values[j++])` 也不是安全调用。固定类型时，优先使用传指针的普通函数，并在需要时提前计算下标。

### GNU 语句表达式：既能声明变量，又能产生值

你在系统代码里可能看到：

```c
/* GNU C 扩展示例：限定为 int，并避免与下面的内部名字冲突 */
#define APP_MIN_GNU_INT(a, b)                 \
    ({                                       \
        int app_min_left_ = (a);              \
        int app_min_right_ = (b);             \
        app_min_left_ < app_min_right_        \
            ? app_min_left_ : app_min_right_; \
    })
```

`({ ... })` 是 **GNU 语句表达式**，最后一个表达式语句决定结果。这里把两个输入各保存一次，再比较，因此普通整数实参各求值一次。但它仍有名字捕获风险，也不具有任意类型通用性。

它与 `do { ... } while (0)` 很像，却不能混为一谈：前者产生一个值，后者是一条语句；前者不是标准 C11/C17/C23 的语句表达式语法。`typeof` 在 GNU C 中长期作为扩展使用，也进入了 C23，但 **C23 有 typeof 不意味着 C23 有 `({ ... })`**。扩展规则见 [GCC：Statement Exprs](https://gcc.gnu.org/onlinedocs/gcc/Statement-Exprs.html)。

已有的[侵入式链表文章](/blog/posts/intrusive-linked-list/)会遇到 `container_of` 一类宏，阅读时也要先区分 ISO C 语法与编译器扩展，再判断指针、类型和对象生命周期的前提。

## 12. 宏、函数、enum，怎样选？

| 需求                               | 通常先考虑             | 原因                                   |
| ---------------------------------- | ---------------------- | -------------------------------------- |
| 几个相关的整数状态                 | `enum`                 | 保留名称和分组关系                     |
| 普通计算、参数校验、交换操作       | 函数或 `static inline` | 类型明确、实参按函数规则求值、便于调试 |
| 需要地址的只读对象                 | `const` 对象           | 它是真正的对象                         |
| 条件编译、头文件保护               | 宏                     | 工作发生在预处理阶段                   |
| 记录调用处文件名、行号、表达式写法 | 薄宏包装函数           | 宏采集上下文，函数承接逻辑             |
| 一份规则生成枚举与名称映射         | X-Macro 或代码生成     | 减少重复维护                           |

在 C11/C17 中，`const int n = 4;` 不会像 C++ 那样普遍成为整数常量表达式；例如需要 `case` 标签或某些编译期常量时，不能简单用它替代所有宏。

C11 的 `_Generic` 还能做类型分派：选择不同的普通函数，再调用它。这样可以把宏限制在分派层，而让计算保留函数的类型约束。例如这里只支持 `int` 和 `double`：

```c
static inline int app_abs_int(int x)
{
    return x < 0 ? -x : x;  // 前提：x != INT_MIN
}

static inline double app_abs_double(double x)
{
    return x < 0 ? -x : x;
}

#define APP_ABS(x) _Generic((x), \
    int: app_abs_int,            \
    double: app_abs_double       \
)(x)
```

`_Generic` 的控制表达式不求值，真正的求值发生在最后的函数实参处。没有匹配类型时会得到编译诊断；这不是覆盖所有数值类型、浮点特殊值语义的通用数学库。

也别用“宏没有调用开销，所以一定更快”决定接口。`inline` 不保证实际内联，普通函数也可能被优化器内联；最终速度要看编译产物和测量。清晰的类型、边界和可维护性，往往比省掉一个函数名字更有价值。

## 13. 动手验证：看预处理结果，比猜更快

先做一个完全不包含头文件的小实验，保存为 `expand.c`：

```c
#define APP_VERSION 42
#define APP_STR_RAW(x) #x
#define APP_STR(x) APP_STR_RAW(x)
#define APP_SQUARE(x) ((x) * (x))
#define APP_SELF APP_SELF

const char *raw = APP_STR_RAW(APP_VERSION);
const char *expanded = APP_STR(APP_VERSION);
int square = APP_SQUARE(2 + 3);
APP_SELF
```

只运行预处理：

```sh
gcc -E -P expand.c
```

`-E` 表示只做预处理，`-P` 隐去输出里的行标记。可以看到：

```c
const char *raw = "APP_VERSION";
const char *expanded = "42";
int square = ((2 + 3) * (2 + 3));
APP_SELF
```

最后一行是用来观察自引用宏的，所以这份文件只用于预处理，不是完整可编译程序。含标准头文件时，展开结果会很长，最好先缩小成这种最小例子。

再下载[完整实验 macro-lab.c](/blog/examples/c-macros/macro-lab.c)，在安装了 GCC 的 Linux、WSL 或兼容环境中运行：

```sh
gcc -std=c17 -Wall -Wextra -Wpedantic -Werror -Wundef macro-lab.c -o macro-lab
./macro-lab
```

程序检查括号、`APP_MIN(i++, 10)` 的确定结果、字符串化、拼接、`if/else` 中的语句宏、`continue` 的实际作用域、数组长度、复合字面量、X-Macro，以及 `_Generic` 的单次求值。成功时标准输出为：

```text
C macro lab: all checks passed
```

标准错误中另有两条演示日志，文件路径和行号取决于保存位置。程序不会执行 `APP_SQUARE(i++)` 这样的未定义行为示例；它们应该用于阅读展开结果、观察编译器诊断，而不是“跑出答案”。

发布前，这份实验已在 WSL Ubuntu 的 GCC 14.2.0 下以严格 C17 选项编译运行。正文的 C23 和 GNU 扩展示例另按对应语言模式检查；这不代表其他编译器或旧版本具有相同支持范围。

遇到复杂宏时，可以固定按这个顺序检查：

1. 展开之后，究竟是表达式、声明，还是一条完整语句？
2. 每个实参出现了几次，哪些位置会实际求值？
3. 它在 `if/else`、循环和有同名局部变量的环境里会怎样？
4. 有没有 `#`、`##`、逗号或需要二次展开的实参？
5. 当前标准模式是否允许用到的语法？

学会这些以后，宏的可读性就不再取决于记住多少“黑魔法”。你能把调用处还原成真正被编译的代码，也能判断什么时候应该把逻辑移回函数。

## 参考与延伸阅读

- [Simon Pantzare：The Use of “do { … } while (0)” in C Macros](https://pilt.github.io/2009/10/16/the-use-of-do-while-0-in-c-macros/)：通过连续修改一个例子，解释多语句宏与分号的关系。
- [Paul J. Lucas：C/C++ Preprocessor Macros](https://dev.to/pauljlucas/cc-preprocessor-macros-fh5)：系统梳理展开机制。阅读时注意区分 C、C++ 与语言版本。
- [Simon Tatham：Coroutines in C](https://www.chiark.greenend.org.uk/~sgtatham/coroutines.html)：宏与状态机组合的经典阅读材料，也能体会隐藏控制流带来的限制。
- [GCC：Macro Pitfalls](https://gcc.gnu.org/onlinedocs/cpp/Macro-Pitfalls.html)：按优先级、分号、副作用、递归和预扫描等问题查阅。
- [Linux kernel coding style：Macros, Enums and RTL](https://docs.kernel.org/process/coding-style.html#macros-enums-and-rtl)：工程接口的取舍，包括什么时候更适合内联函数。
- [WG14 N1570，C11 委员会草案](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：可查 §6.5 的求值关系、§6.5.1.1 的泛型选择、§6.10.3 的宏替换和 §7.2 的断言。
- [WG14 N3096，C23 工作草案](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3096.pdf)：用于核对 C23 的 `__VA_OPT__` 等规则；草案不应与最终出版版混称。
