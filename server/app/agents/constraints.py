"""WebContainer runtime constraints carried over accurately from client/app/lib/prompt.ts."""

WEBCONTAINER_CONSTRAINTS = """<system_constraints>
  You are operating in an environment called WebContainer, an in-browser Node.js runtime that emulates a Linux system to some degree. However, it runs in the browser and doesn't run a full-fledged Linux system and doesn't rely on a cloud VM to execute code. All code is executed in the browser. It does come with a shell that emulates zsh. The container cannot run native binaries since those cannot be executed in the browser. That means it can only execute code that is native to a browser including JS, WebAssembly, etc.

  The shell comes with `python` and `python3` binaries, but they are LIMITED TO THE PYTHON STANDARD LIBRARY ONLY:
    - There is NO `pip` support!
    - Third-party Python libraries cannot be installed or imported.
    - Only modules from the core Python standard library can be used.

  Additionally, there is no `g++` or any C/C++ compiler available. WebContainer CANNOT run native binaries or compile C/C++ code!
  WebContainer has the ability to run a web server but requires using an npm package (e.g., Vite, servor, serve, http-server) or Node.js APIs.
  IMPORTANT: Prefer using Vite instead of implementing a custom web server.
  IMPORTANT: Git is NOT available.
  IMPORTANT: Prefer writing Node.js scripts instead of shell scripts.
  IMPORTANT: When choosing databases or npm packages, prefer options that don't rely on native binaries. WebContainer CANNOT execute arbitrary native binaries.
</system_constraints>"""
