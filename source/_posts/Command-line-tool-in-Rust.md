---
title: Command line tool in Rust
date: 2020-02-18 17:09:13
tags: rust
---

After reading the 'Programming Rust' book, I am tempted to write a small command-line tool in Rust to improve my Rust-literacy. This feels to be a feasible task for a beginner like me. In the past, I have written a few tools in Python. It is hard to share them with others because they require Python environments with specific packages installed. In contrast, Rust builds a single executable that packages all the dependencies and doesn't bloat in size. This is a definite win. 

I chose the simplest one that just opens a URL in Chrome from the command line: `gitweb`. As the name suggests, this command will open the remote repository that is configured for the git project where the command is invoked. It's useful to submit a pull request in the browser right after a code push from the command line. This is how it looks like:

{% video gitweb-demo.mp4 %}

 
## How does it work

These are the steps:
1. get the addresses for the configured git remotes via `git remote`;
2. the address could be in the HTTP format (begins with `https://`) or the SSH format (begins with `@git` and ends with `.git`), which can be used to derive the URL of the remote repository;
3. open the URL in Chrome. 


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

In Rust, running external command is supported by [std::process::Command](https://doc.rust-lang.org/std/process/struct.Command.html). The usage is very straightforward:
```rust
fn open_chrome(url : String) -> Result<ExitStatus> {
    return Command::new("open")
        .arg("-a")
        .arg("google chrome")
        .arg(url)
        .status();
}
```
This is enough for opening Chrome and navigate to the given URL.

The next step is to invoke `git` and read the output from _stdout_. The [`Command::output`](https://doc.rust-lang.org/std/process/struct.Command.html#method.output) method provides access to the exit code and the buffered output from _stdout_ and _stderr_. But there can be many scenarios for failure during the command invocation and the subsequent IO. Rust requires proper treatment of these failures. For simplicity, I will just terminate the application when any failure is encountered, and display the failure message when applicable. 
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
If the command returns successfully, the output from _stdout_ will be read as a list of strings to be digested later:
```rust
String::from_utf8(output.stdout)
    .unwrap()
    .lines()
    .map(|s| s.to_owned())
    .collect::<Vec<_>>()
```

## Playing with strings

Now we have retrieved all the remote addresses. But they are not the URL of the remote project (e.g. a project on Github). Luckily, the addresses that I usually encounter are well-structured so I could derive the URLs from them. For this, we need some regular expression support provided by the `regex` crate.

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
 To be honest, this code is more verbose than the equivalent in Perl. Also interesting it is to note that the seemingly advanced `lazy_static!` is presented in the introductory text as a standard pattern. 

## Wire it up

The major pieces are ready. Let's wire them up: first, use `git remote` to get all remote identifiers; then use `git remote get-url` to fetch the remote addresses; after that, transform the repo URLs; at last, use `open -a "google chrome"` to open _the first_ URL in Chrome.

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

When there are multiple remotes, it is not ideal to always open the first option. The user should be prompted to make a choice. Implementation-wise, we need to display a list of available options. These are annotated by indexes so that the user can input the index to select an option. Sometimes, the user's input is illegal, i.e. the value is not an integer or is out-of-range of the provided options. In such cases, we should prompt the user to retry with valid input. This is captured by the following loop:

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
This function takes an input hint as _msg_, and a function to parse and validate user's input as _parse_. The function is used as below:
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

Admittedly, I have spent more time with the Rust implementation than the Python counterpart. But I have learned many things in Rust that I could apply to build other tools. Also, the final compiled executable is only 1.5 MB large and runs smoothly. To me, this endeavor is quite worthy.  

_The source code of this project can be found on [github](https://github.com/wowmmichael/gitweb-rs)._