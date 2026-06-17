"""Add detail.tags to every route options object in route files."""
import re, os

BASE = "src/routes"
TAGS = {
    "users": "Users", "students": "Students",
    "teachers": "Teachers", "tournaments": "Tournaments",
}


def add_tags_to_file(fname: str, tag: str) -> None:
    path = os.path.join(BASE, fname)
    with open(path) as f:
        src = f.read()

    # Fix any mangled plugin header (leftover from failed sed)
    src = re.sub(
        r"export const \w+ = new Elysia\(\{ prefix:\s*\n\s*\.guard\(.*?\)\s*",
        lambda m: "export const " + re.search(r"export const (\w+)", m.group()).group(1) + " = new Elysia({ prefix: ",
        src,
    )

    # In each route call .method("path", handler, { options }),
    # insert detail: { tags: [Tag] } at the top of the options object
    # (but only if detail is not already present)

    def insert_detail(m: re.Match) -> str:
        method = m.group(1)
        path = m.group(2)
        handler_body = m.group(3)
        opts_body = m.group(4)
        if "detail:" in opts_body:
            return m.group(0)
        # Insert detail after the opening brace of the options object
        opts_with_detail = "{\n      detail: { tags: [\"" + tag + "\"] },\n" + opts_body[1:]
        return "." + method + '(\n    "' + path + '",\n' + handler_body + "    " + opts_with_detail + "\n  )"

    # Match route definitions: .method("path", handler_fn, { ... })
    # The handler is either async (params) => { ... } or ({ query }) => { ... }
    pattern = (
        r"\.(get|post|patch|delete)"
        r'\(\s*"([^"]+)"\s*,\s*'
        r"((?:async )?\(\s*\{[^}]*\}\s*\)\s*=>\s*\{[\s\S]*?\})\s*,\s*"
        r"(\{[\s\S]*?\})\s*\)"
    )
    src = re.sub(pattern, insert_detail, src)

    with open(path, "w") as f:
        f.write(src)
    print(f"  ✓ {fname}")


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for fname, tag in TAGS.items():
        add_tags_to_file(fname + ".ts", tag)
    print("Done — all route files tagged for Swagger")
