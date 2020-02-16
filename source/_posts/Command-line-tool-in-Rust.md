---
title: Command line tool in Rust
date: 2020-02-18 17:09:13
tags: rust
---

After reading the 'Programming Rust' book, I would like to write some real codes in Rust to build up the coding skill. Writing a small command line tool seems to be a good choice. I have written a few in Python before. Although handy to use, they are hard to be shared, because they require specific Python environments with all the dependencies installed. In comparison, Rust produces stand-alone executables that are small and fast. Definitely worths trying.

I started with a simple tool: `gitweb`. If I type the command from the terminal inside a git project, it will open the browser and land me on the remote repository if any remote is configured. This is how it looks like:

{% video gitweb-demo.mp4 %}

 
## How does it work

These are the steps:
1. get the addresses for the configured git remotes via `git remote`;
2. the address can be in HTTP format (begins with `https://`) or SSH format (begins with `@git` and ends with `.git`), which can be used to derive the web url of the remote repository;
3. open the web url in the browser. 


## Getting started

1. bootstrap a project for binary executable
    ```sh
    cargo new --bin gitweb
    ```
2. build & run the project for the first time
    ```sh
    cargo build && cargo run
    ```
3. import the project into Intellij (with Rust plugin installed).


## Invoking other commands

In Rust, running other command is supported by [std::process::Command](https://doc.rust-lang.org/std/process/struct.Command.html). Using something like:
```rust
fn open_chrome() -> Result<ExitStatus> {
    return Command::new("open")
        .arg("-a")
        .arg("google chrome")
        .status();
}
```
, I am able to open Chrome from the compiled executable.

The next step is to invoke `git` command and read the stdout. The [`Command::output`](https://doc.rust-lang.org/std/process/struct.Command.html#method.output) method provides the exit code and the data from _stdout_ and _stderr_. It is also the time to think about the erroneous situations. For example, what happens if the external command does not exist on the host system, what if the command failed to complete executation, and etc. These are managed by checking the exit code and showing what is inside _stderr_.
```rust
let output = Command::new(&cmd)
    .args(args)
    .output()
    .expect(&format!("cannot run command `{}`", cmd_repr)); // panic if the command failed to start


if !output.status.success() {
    let stderr = String::from_utf8(output.stderr).ok()
        .unwrap_or(String::default());

    panic!("cannot run command `{}` with error:\n{}", cmd_repr, stderr); // panic if the exit status is not success, and log stderr
}
```
If the command returns successfully, read the output from _stdout_ as a list of strings to be digested later:
```rust
String::from_utf8(output.stdout)
    .unwrap()
    .lines()
    .map(|s| s.to_owned())
    .collect::<Vec<_>>()
```

## Playing with strings

Now we can retrieve all the remote addresses in git. But they are not the web url that we could use to open the browser. Luckily, the address is very structured so that we can derive the web url with some regular expressions. To achieve this, we need to import and use the `regex` crate.

```rust
extern crate regex;
use regex::Regex;

pub fn derive_repo_url<S>(addr: S) -> String
    where S: AsRef<str>
{
    lazy_static! {
        static ref RE: Regex = Regex::new(r"(?x)
            ^(?:https?://|git@)
            (?P<host>[^:/]+)
            (?:[:/])
            (?P<project>[\w/-]+)
            (?:[.]git)?$
            ").unwrap();
    }

    let cap = RE.captures(addr.as_ref()).expect(&format!("invalid git url: {}", addr.as_ref()));
    if let (Some(h), Some(p)) = (cap.name("host"), cap.name("project")) {
        return format!("https://{}/{}", h.as_str(), p.as_str())
    }
    panic!("invalid git address {}", addr.as_ref());
}
```
 To be honest, this code is much more verbose than the equivalent in Perl. It is also interesting to note that the seemingly advanced `lazy_static!` is presented in the introductory text about regular expressions in Rust. 

## Wire it up

The major pieces are ready. Let's wire them up: first, use `git remote` to get all remote identifiers; then use `git remote get-url` to fetch the remote addresses; then transform the repo urls; at last, use `open -a "google chrome"` to open _the first_ url in Chrome.

```rust
fn open_chrome(target: &str) {
    run_command!("open", "-a", "google chrome", target);
}

fn read_git_remote() -> Vec<String> {
    run_command!("git", "remote")
        .iter()
        .map(|r| run_command!("git", "remote", "get-url", r).pop().unwrap())
        .map(|r| derive_repo_url(r))
        .collect()
}

fn main() {
    let remotes = read_git_remote();
    if remotes.is_empty() {
        println!("no remote is found!");
        exit(1);
    }
    open_chrome(&remotes[0]);
}
```

## Prompt the user to choose which remote repo to open

When there are multiple remotes, it is definitely not ideal to always open the first one. The user should be prompted to make a choice. Implementation-wise, we should display a list of options annotated by the indexes and wait for the input from the user. The input will then be parsed into a valid index. If the input is illegal, i.e. the value is not an integer or is out-of-range, we should alert the user and ask for a retry. This flow is captured by the following loop:
```rust
pub fn prompt_value<S, T, V>(msg: S, parse: T) -> V
    where S: AsRef<str> + Display,
          T: Fn(String) -> Result<V, PromptInputError>
{
    loop {
        print!("{}: ", msg);
        stdout().flush().unwrap();
        let mut line = String::new();
        stdin().read_line(&mut line).unwrap();

        match parse(line.trim_end().to_string()) {
            Ok(received) => return received,
            Err(e) => println!("{}", e)
        }
    }
}
```
This function takes an input hint as _msg_, and a function to parse and validate user's input as _parse_. Below is how this function is used:
```rust
let hint = format!("Type choice (0 - {})", options.len() - 1);
let parse = |s| {
    s.parse::<usize>()
        .map_err(|_| PromptInputError(String::from(&s)))
        .and_then(|v| {
            if v < options.len() {
                Ok(v)
            } else {
                Err(PromptInputError(String::from(&s)))
            }
        })
};
let chosen = prompt_value(hint, parse);
```
The value in _chosen_ tells which remote repo to open.  

## Conlusion

These are all about `gitweb`. I have to admit the time and effort used for the Rust implementation are much higher than the equivalent Python implementation. But the final compiled executable is only about 1.5 MB in size with no extra dependencies. To me, this endeavor is well justified. I have also accumulated some useful patterns, such as invoking external commands and prompting for inputs, which will be useful for future projects.  

_The source code of this project can be found in [github](https://github.com/wowmmichael/gitweb-rs)._