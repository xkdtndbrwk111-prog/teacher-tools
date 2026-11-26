// Phase 3C isolated native port of runtime-src/system/share-input.ps1 (input classification and cursor rules retained).
using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
internal static class NativeShareInput {
    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr extra; }
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr mod, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll", EntryPoint="SetWindowLongW")] static extern int SetWindowLong(IntPtr h, int index, int value);
    const int WS_EX_NOACTIVATE = 0x08000000;
    // Windows marks mouse messages made from touch or pen with this signature.
    static bool FromTouch(IntPtr extra) { return ((long)extra & 0xFFFFFF00L) == 0xFF515700L; }
    static IntPtr board, hook;
    static Rectangle area;
    static string optionsFile;
    static bool keyboard, cursor, clickedIn; static int clickTick;
    static POINT lastReal; static bool haveReal; static int lastRealTick, stillTicks; static POINT lastSeen;
    static bool touchJump;
    static HookProc proc = OnMouse;
    // While the diagnostic runs (it leaves share-input-trace.on), every decision goes to share-input-trace.txt.
    static string traceFlag, traceFile; static bool tracing;
    static void Trace(string s) {
        if (!tracing) return;
        try { File.AppendAllText(traceFile, Environment.TickCount + " " + s + Environment.NewLine); } catch { }
    }
    // A hand on the mouse: not marked as touch, not made by a program (menus can turn a touch into such input),
    // and not a pointer that lands far inside the board in one step from outside it.
    static bool RealMouse(MSLLHOOKSTRUCT m) {
        if (FromTouch(m.extra) || (m.flags & 0x03) != 0) return false;
        // Some boards send a dragging finger as plain mouse moves that run past the board's edge,
        // so a finger stays a finger until the pointer rests; Tick ends it.
        if (touchJump) return false;
        if (haveReal && area.Contains(m.pt.x, m.pt.y) && !area.Contains(lastReal.x, lastReal.y)) {
            long dx = m.pt.x - lastReal.x, dy = m.pt.y - lastReal.y;
            if (dx * dx + dy * dy > 300L * 300L) {
                touchJump = true;
                Trace("touch-start " + m.pt.x + "," + m.pt.y + " teacher-at " + lastReal.x + "," + lastReal.y);
            }
        }
        return !touchJump;
    }
    static void NoActivate(bool on) {
        int ex = GetWindowLong(board, -20);
        int next = on ? ex | WS_EX_NOACTIVATE : ex & ~WS_EX_NOACTIVATE;
        if (next != ex) SetWindowLong(board, -20, next);
    }
    static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam) {
        if (code >= 0) try {
            var m = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            int msg = (int)wParam;
            bool real = RealMouse(m);
            if (msg == 0x0201 || msg == 0x0202) Trace((real ? "mouse-" : "touch-") + (msg == 0x0201 ? "down " : "up ") + m.pt.x + "," + m.pt.y + (area.Contains(m.pt.x, m.pt.y) ? " board" : " other"));
            if (real) {
                lastReal = m.pt; haveReal = true; lastRealTick = Environment.TickCount;
                // A real click on the board lets the board take the keyboard, as any window would.
                if (keyboard && (msg == 0x0201 || msg == 0x0204 || msg == 0x0207)) {
                    clickedIn = GetAncestor(WindowFromPoint(m.pt), 2) == board; clickTick = Environment.TickCount;
                    NoActivate(!clickedIn);
                }
            }
        } catch (Exception ex) { Log("error in hook " + ex.GetType().Name + ": " + ex.Message); }
        return CallNextHookEx(hook, code, wParam, lParam);
    }
    static void ReadOptions() {
        bool k = false, c = false;
        try {
            string s = File.Exists(optionsFile) ? File.ReadAllText(optionsFile) : "";
            k = s.Contains("\"keyboard\":true"); c = s.Contains("\"cursor\":true");
        } catch { }
        if (k != keyboard) { keyboard = k; NoActivate(k && !clickedIn); }
        cursor = c;
        tracing = File.Exists(traceFlag);
        // The board is wherever the dashboard covers, in the same real pixels the hook reports.
        RECT w; if (GetWindowRect(board, out w)) area = Rectangle.FromLTRB(w.left, w.top, w.right, w.bottom);
        bool want = keyboard || cursor;
        if (want && hook == IntPtr.Zero) {hook = SetWindowsHookEx(14, proc, GetModuleHandle(null), 0);if(hook==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}
        if (!want && hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
    }
    static void Tick() {
        // The board gives the keyboard back once the teacher moves to another window; the click itself needs a moment to land first.
        if (keyboard && clickedIn && Environment.TickCount - clickTick > 800 && GetForegroundWindow() != board) { clickedIn = false; NoActivate(true); }
        if (!haveReal || (!cursor && !touchJump)) return;
        POINT p; if (!GetCursorPos(out p)) return;
        stillTicks = (p.x == lastSeen.x && p.y == lastSeen.y) ? stillTicks + 1 : 0; lastSeen = p;
        bool moved = p.x != lastReal.x || p.y != lastReal.y;
        bool buttons = (GetAsyncKeyState(1) & 0x8000) != 0 || (GetAsyncKeyState(2) & 0x8000) != 0;
        // A touch ends once the pointer has rested for 0.15 seconds with no button down, wherever the board left it.
        if (touchJump) {
            if (stillTicks >= 3 && !buttons) {
                touchJump = false;
                if (cursor && moved) { SetCursorPos(lastReal.x, lastReal.y); Trace("return " + p.x + "," + p.y + " -> " + lastReal.x + "," + lastReal.y); }
                else Trace("touch-end " + p.x + "," + p.y);
            }
            return;
        }
        if (!cursor) return;
        // A jump onto the board that the hook never saw, once the finger has lifted.
        if (moved && stillTicks >= 2 && !buttons && Environment.TickCount - lastRealTick > 150
            && area.Contains(p.x, p.y) && !area.Contains(lastReal.x, lastReal.y))
        { SetCursorPos(lastReal.x, lastReal.y); Trace("return-unseen " + p.x + "," + p.y + " -> " + lastReal.x + "," + lastReal.y); }
    }
    // share-input.log keeps starts, stops and errors; share-input-status.json is rewritten every second while the helper runs,
    // so the dashboard and the diagnostic can tell a running helper from a stopped one.
    static string logFile, statusFile, release;
    static void Log(string s) {
        try {
            var f = new FileInfo(logFile);
            if (f.Exists && f.Length > 65536) f.Delete();
            File.AppendAllText(logFile, DateTime.Now.ToString("s") + " " + s + Environment.NewLine);
        } catch { }
    }
    static void WriteStatus() {
        try {
            File.WriteAllText(statusFile, string.Format("{{\"pid\":{0},\"release\":\"{1}\",\"hook\":{2},\"keyboard\":{3},\"cursor\":{4},\"tracing\":{5},\"time\":\"{6}\"}}",
                System.Diagnostics.Process.GetCurrentProcess().Id, release, hook != IntPtr.Zero ? "true" : "false", keyboard ? "true" : "false",
                cursor ? "true" : "false", tracing ? "true" : "false", DateTime.Now.ToString("s")));
        } catch { }
    }
    public static bool Alive(IntPtr h) { return h != IntPtr.Zero && IsWindow(h); }
    static Timer timer;
    static int ticks;
    static bool active;
    public static void Start(IntPtr window,string options,string releaseName) {
        if(active)throw new InvalidOperationException("Native input helper already active");
        if(!IsWindow(window))throw new InvalidOperationException("Invalid board window");
        string dir=Path.GetDirectoryName(options);
        logFile=Path.Combine(dir,"share-input.log");statusFile=Path.Combine(dir,"share-input-status.json");
        release=releaseName;board=window;optionsFile=options;
        traceFlag=Path.Combine(dir,"share-input-trace.on");traceFile=Path.Combine(dir,"share-input-trace.txt");
        ticks=0;active=true;
        try {
            ReadOptions();WriteStatus();
            timer=new Timer();timer.Interval=50;
            timer.Tick+=(s,e)=>{
                try{
                    if(!IsWindow(board)){Stop();return;}
                    if(ticks++%20==0){ReadOptions();WriteStatus();}
                    Tick();
                }catch(Exception ex){Log("error in tick "+ex.GetType().Name+": "+ex.Message);}
            };
            timer.Start();Log("native helper started");
        } catch {Stop();throw;}
    }
    public static void Stop(){
        if(!active)return;active=false;
        if(timer!=null){timer.Stop();timer.Dispose();timer=null;}
        if(hook!=IntPtr.Zero){UnhookWindowsHookEx(hook);hook=IntPtr.Zero;}
        if(IsWindow(board))NoActivate(false);
        try{File.Delete(statusFile);}catch{}
        Log("native helper stopped");
    }
}
