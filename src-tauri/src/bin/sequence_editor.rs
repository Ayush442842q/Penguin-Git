use std::env;
use std::fs;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("penguingit-sequence-editor error: missing git todo file path argument");
        process::exit(1);
    }

    let git_todo_path = &args[1];

    let todo_override_path = match env::var("PENGUINGIT_TODO_FILE") {
        Ok(val) if !val.trim().is_empty() => val,
        _ => {
            eprintln!("penguingit-sequence-editor error: PENGUINGIT_TODO_FILE environment variable not set");
            process::exit(1);
        }
    };

    let new_content = match fs::read_to_string(&todo_override_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("penguingit-sequence-editor error: failed to read '{todo_override_path}': {e}");
            process::exit(1);
        }
    };

    if let Err(e) = fs::write(git_todo_path, new_content) {
        eprintln!("penguingit-sequence-editor error: failed to write git todo file '{git_todo_path}': {e}");
        process::exit(1);
    }

    process::exit(0);
}
