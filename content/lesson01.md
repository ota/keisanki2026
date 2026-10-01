---
title: 第1回　C言語プログラミング入門
pageTitle: 第1回｜C言語プログラミング入門
number: 01
term: 後期 · Q3
subhead: 後期 第1回
footer: 後期 第1回 / C言語プログラミング入門
progress: off
---

## 今回の目標 {#goals}

:::goals
- Cコードを動かす | 自分で入力して実行する。
- 変数を作る | データに合う型を選ぶ。
- 結果を表示する | `printf` で変数の値を表示する。
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

（※Pythonと比べて、コード量が多いです。）

:::concepts
- `#include <stdio.h>` は画面への出力に使う準備です。
  - 「studio.h」ではなく `stdio.h` と書きます。
- `int main(void) { ... }` の中に、実行する処理を書きます。
  - 括弧 `()`・`{}` の打ち忘れに注意しましょう。
- `printf` で文字を表示します。
  - 行末のセミコロン `;` を忘れずに書きましょう。
- `\n` は改行を表します。
- `return 0;` は正常終了を表します。
- `//` から行末まではコメントです。
:::

:::exercise first hello.c
```c
#include <stdio.h>

int main(void) {
    printf("Hello, World!\n");
    return 0;
}

// これはコメントです。
```
:::

:::check
Hello, World! 以外の文字列を表示してみましょう。
:::

## 変数 {#variable}

Cでは、変数を使う前にデータの型を宣言します。

たとえば、整数型の変数 `number` を作って `10` という値を入れるには、　
`int number = 10;` と書きます。

printf で変数を用いるには、%ではじまる「書式指定子」を書きます。

:::exercise second variable.c
```c
#include <stdio.h>

int main(void) {
    int number = 10;

    printf("%d\n", number);
    return 0;
}
```
:::

書式指定子の前後に、好きな内容を書くことができます。

:::exercise third variable.c
```c
#include <stdio.h>

int main(void) {
    float pi = 3.14;

    printf("円周率は %f です。\n", pi);
    return 0;
}
```
:::

## 変数の型 {#variables}

書式指定子は、データの型に合わせて使い分けます。

| 型 | 値の例 | 書式指定子 |
| --- | --- | --- |
| `int` | 10（整数） | `%d` |
| `float` | 3.14（小数） | `%f` |
| `char` | 'A'（1文字） | `%c` |
| `char[]` | "Hello"（文字列） | `%s` |

1文字は `'A'`、文字列は `"Hello"` のように囲みます。

:::exercise fourth variables.c
```c
#include <stdio.h>

int main(void) {
    char letter = 'A';
    char word[] = "Hello";

    printf("%c\n", letter);
    printf("%s\n", word);
    return 0;
}
```
:::

:::check
`letter` と `word` を変えると出力がどう変わるか、確認してみましょう。
:::

## printf の応用 {#printf-two-values}

- 変数をカンマ `,` で区切ると、1つの `printf` で複数の値を表示できます。
  - 書式指定子と変数の順番を合わせます。
  - この例では、`%d` に `number`、`%c` に `letter` が対応します。

:::exercise printf-two-values printf_two.c
```c
#include <stdio.h>

int main(void) {
    int number = 10;
    char letter = 'A';

    printf("%d %c\n", number, letter);
    return 0;
}
```
:::

:::expected
10 A
:::

## 演習問題 {#challenge}

:::notice
**※AIの使用を禁止します。自分で考えて解答しましょう。**
:::

### 課題1　好きな文字列を表示する

「Hello World」以外の好きな文字列を出力するCプログラムを作成してください。

:::exercise task1
:::

### 課題2　出席番号と氏名を表示する

整数の変数 `number` と文字列の変数 `name` を使い、あなたの出席番号と氏名を次のように表示してください。

:::expected
出席番号 99 番の 太田健吾 です。
:::

:::exercise task2
:::

### 課題3　山形模様を表示する

空白と `*` を組み合わせて、次のような山形模様を出力するCプログラムを作成してください。

:::expected task3
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
- 整数・小数・文字・文字列では、書式指定子が異なる。

次回は演算子を使い分けて、計算の幅を広げます。
