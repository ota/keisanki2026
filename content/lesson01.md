---
title: 第1回　C言語プログラミング入門
pageTitle: 第1回｜C言語プログラミング入門
number: 01
term: 後期 · Q3
subhead: 後期 第1回
footer: 後期 第1回 / C言語プログラミング入門
---

## 今回の目標 {#goals}

:::goals
- Cコードを動かす | 自分で入力して実行する。
- 変数を作る | データに合う型を選ぶ。
- 結果を表示する | `printf` の指定子を使う。
:::

:::howto 演習の進め方
- サンプルコードを見て、すぐ下の入力欄に自分で打ち込みます。
- 「実行する」を押して、結果を確認します。
- 入力内容はパソコンに自動的に保存されます。
:::

## タイピング練習 {#warmup}

- [タイピング速度測定 ↗](https://taisoku.com/)で自己ベストを測ります。
  - 目標はBランク（秒速3打鍵）以上です。

## C言語とは {#about-c}

:::about-c /images/c-language-logo.png | C言語のロゴ
- 1972年に開発された、いろいろな用途に使える「汎用プログラミング言語」です。
  - 現在でも、現役で使われています。
- Pythonなどに比べて、コンピュータの仕組みに近い言語です。
  - この特徴を「低レイヤ」と呼びます。
  - CPUやメモリの仕組みに沿ってプログラムを書きます。
  - 文法はPythonなどより厳密で、習得はやや難しいです。
  - 使いこなせば、Pythonより速く動く場合があります。
- OSなど、システムの基盤部分を作る際に使われます。
  - この用途から「システムプログラミング言語」と呼ばれます。
  - Windows・macOS・LinuxなどのOSの中核に使われています。
  - Nintendo Switchなど、ゲーム機の中核にも使われています。
:::

## Hello World {#first-code}

サンプルコードを書き写して、「Hello, World!」と表示してみましょう。

:::concepts
- `#include <stdio.h>` は画面への出力に使う準備です。
- `int main(void) { ... }` の中に、実行する処理を書きます。
- `printf` で文字を表示し、`\n` で改行します。
- `return 0;` は正常終了を表します。
- `//` から行末まではコメントです。
:::

入力時は `stdio.h` のつづり、括弧、`;` を確認しましょう。

:::exercise first hello.c
```c
#include <stdio.h>

int main(void) {
    printf("Hello, World!\n");
    return 0;
}
```
:::

:::check
表示する言葉を変えて、もう一度実行してみましょう。
:::

## 変数の型 {#variables}

Cでは、変数を使う前にデータの型を宣言します。

| 型 | 値の例 | 表示の目印 |
| --- | --- | --- |
| `int` | 10（整数） | `%d` |
| `float` | 3.14（小数） | `%f` |
| `char` | 'A'（1文字） | `%c` |
| `char[]` | "Hello"（文字列） | `%s` |

1文字は `'A'`、文字列は `"Hello"` のように囲みます。

:::exercise second variables.c
```c
#include <stdio.h>

int main(void) {
    int number = 10;
    float pi = 3.14f;
    char letter = 'A';
    char word[] = "Hello";

    printf("%d\n", number);
    printf("%f\n", pi);
    printf("%c\n", letter);
    printf("%s\n", word);
    return 0;
}
```
:::

:::check
`number` と `letter` を変えると、どの出力が変わりますか。
:::

## 演習問題 {#challenge}

※AIの使用を禁止します。自分で考えて解答しましょう。

### 課題1　好きな文字列を表示する

「Hello World」以外の好きな文字列を出力するCプログラムを作成してください。

:::exercise task1
:::

### 課題2　出席番号と氏名を表示する

整数の変数 `number` と文字列の変数 `name` を使い、あなたの出席番号と氏名を表示してください。

:::expected
出席番号 99 番の 太田健吾 です。
:::

:::exercise task2
:::

### 課題3　山形模様を表示する

空白と `*` を組み合わせて、次の山形模様を出力するCプログラムを作成してください。

:::expected
```
  *
 ***
*****
```
:::

:::exercise task3
:::

:::hint
- 課題1：Hello Worldのサンプルコードを使います。
- 課題2：`int number` と `char name[]` を使います。
- 課題3：`printf` を3回使っても構いません。
:::

## 今日のまとめ {#summary}

- 文字列の表示には `printf` を使う。
- Cの変数は、値に合った型を宣言してから使う。
- 整数・小数・文字・文字列では、表示指定子が異なる。

次回は演算子を使い分けて、計算の幅を広げます。
