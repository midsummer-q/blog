/* Companion to /blog/posts/c-macros-explained/.
 * Compile: gcc -std=c17 -Wall -Wextra -Wpedantic -Werror -Wundef macro-lab.c -o macro-lab
 * This program deliberately avoids executing undefined-behavior examples.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define APP_CHECK(condition) \
    do { \
        if (!(condition)) { \
            fprintf(stderr, "%s:%d: check failed: %s\n", \
                    __FILE__, __LINE__, #condition); \
            exit(EXIT_FAILURE); \
        } \
    } while (0)

#define APP_SQUARE_BAD(x) x * x
#define APP_SQUARE_HALF(x) (x) * (x)
#define APP_SQUARE(x) ((x) * (x))
#define APP_MIN(a, b) ((a) < (b) ? (a) : (b))
#define APP_VERSION 42
#define APP_STR_RAW(x) #x
#define APP_STR(x) APP_STR_RAW(x)
#define APP_CAT_RAW(a, b) a ## b
#define APP_CAT(a, b) APP_CAT_RAW(a, b)
#define APP_ID 7
#define APP_ARRAY_LEN(a) (sizeof(a) / sizeof((a)[0]))
#define APP_POINT_X(p) ((p).x)
#define APP_SET_AND_COUNT(target, value, count) \
    do { \
        (target) = (value); \
        ++(count); \
    } while (0)
#define APP_SKIP_IF_ZERO(x) \
    do { \
        if ((x) == 0) \
            continue; \
    } while (0)
#define APP_LOG(...) \
    do { \
        fprintf(stderr, "[%s:%d] ", __FILE__, __LINE__); \
        fprintf(stderr, __VA_ARGS__); \
        fputc('\n', stderr); \
    } while (0)
#define APP_DEBUG_LOG(...) do { } while (0)

#define APP_STATUS_LIST(X) \
    X(IDLE, 0) \
    X(RUNNING, 1) \
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

static inline int app_square_int(int x)
{
    return x * x;
}

static inline int app_abs_int(int x)
{
    return x < 0 ? -x : x; /* Precondition: x != INT_MIN. */
}

static inline double app_abs_double(double x)
{
    return x < 0 ? -x : x;
}

#define APP_ABS(x) _Generic((x), \
    int: app_abs_int, \
    double: app_abs_double \
)(x)

int main(void)
{
    APP_CHECK(APP_SQUARE_BAD(2 + 3) == 11);
    APP_CHECK(100 / APP_SQUARE_HALF(5) == 100);
    APP_CHECK(APP_SQUARE(2 + 3) == 25);
    APP_CHECK(100 / APP_SQUARE(5) == 4);

    int i = 3;
    int result = APP_MIN(i++, 10);
    APP_CHECK(result == 4);
    APP_CHECK(i == 5);
    i = 3;
    result = app_square_int(i++);
    APP_CHECK(result == 9);
    APP_CHECK(i == 4);

    APP_CHECK(strcmp(APP_STR_RAW(APP_VERSION), "APP_VERSION") == 0);
    APP_CHECK(strcmp(APP_STR(APP_VERSION), "42") == 0);
    APP_CHECK(strcmp(APP_STR_RAW( left   + right ), "left + right") == 0);
    int APP_CAT(sensor_, APP_ID) = 100;
    APP_CHECK(sensor_7 == 100);
    int APP_CAT_RAW(sensor_, APP_ID) = 200;
    APP_CHECK(sensor_APP_ID == 200);

    int value = 0;
    int count = 0;
    if (1)
        APP_SET_AND_COUNT(value, 7, count);
    else
        APP_SET_AND_COUNT(value, 9, count);
    APP_CHECK(value == 7 && count == 1);
    if (0)
        APP_SET_AND_COUNT(value, 11, count);
    else
        APP_SET_AND_COUNT(value, 13, count);
    APP_CHECK(value == 13 && count == 2);

    int visits = 0;
    for (int n = 0; n < 2; ++n) {
        APP_SKIP_IF_ZERO(n);
        ++visits;
    }
    APP_CHECK(visits == 2);

    int values[] = {10, 20, 30};
    APP_CHECK(APP_ARRAY_LEN(values) == 3);
    struct point { int x, y; };
    APP_CHECK(APP_POINT_X(((struct point){1, 2})) == 1);
    APP_CHECK(APP_STATUS_FAILED == 2);
    APP_CHECK(strcmp(app_status_name(APP_STATUS_RUNNING), "RUNNING") == 0);
    APP_CHECK(strcmp(app_status_name((enum app_status)99), "UNKNOWN") == 0);

    i = -3;
    result = APP_ABS(i++);
    APP_CHECK(result == 3 && i == -2);
    APP_CHECK(APP_ABS(-2.5) == 2.5);
    APP_DEBUG_LOG("not evaluated: %d", i++);
    APP_CHECK(i == -2);

    APP_LOG("started");
    APP_LOG("count=%d", 3);
    puts("C macro lab: all checks passed");
    return EXIT_SUCCESS;
}
