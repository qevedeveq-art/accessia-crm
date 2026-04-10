// ACCESSIA Pro — macOS native (AppKit + WKWebView)
// Autonome : démarre, surveille et arrête les services sans script externe.

import AppKit
import WebKit
import Foundation

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Constants & Paths
// ─────────────────────────────────────────────────────────────────────────────

private enum Paths {
    static var resources: String {
        let exe = Bundle.main.executablePath ?? ProcessInfo.processInfo.arguments[0]
        let macos    = (exe as NSString).deletingLastPathComponent
        let contents = (macos as NSString).deletingLastPathComponent
        return (contents as NSString).appendingPathComponent("Resources")
    }
    static var appSupport: String {
        let base = NSSearchPathForDirectoriesInDomains(
            .applicationSupportDirectory, .userDomainMask, true).first!
        return base + "/ACCESSIA Pro"
    }
    static var backendPid: String  { appSupport + "/backend-native.pid" }
    static var frontendPid: String { appSupport + "/frontend-native.pid" }
    static var logFile: String     { appSupport + "/logs/launcher-native.log" }
    static var launchScript: String { resources + "/runtime-native/launch.sh" }
}

private enum Ports {
    static let backend  = 8001
    static let frontend = 3001
    static var healthURL: URL { URL(string: "http://127.0.0.1:\(backend)/api/health")! }
    static var appURL:    URL { URL(string: "http://localhost:\(frontend)")! }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Service State
// ─────────────────────────────────────────────────────────────────────────────

enum ServiceState: Equatable {
    case idle
    case starting(progress: String)
    case running
    case stopped
    case failed(String)

    static func == (lhs: ServiceState, rhs: ServiceState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle), (.running, .running), (.stopped, .stopped): return true
        case (.starting(let a), .starting(let b)): return a == b
        case (.failed(let a), .failed(let b)): return a == b
        default: return false
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Process Manager
// ─────────────────────────────────────────────────────────────────────────────

final class ProcessManager {

    // Published via closure to avoid SwiftUI dependency
    var onState: ((ServiceState) -> Void)?

    private(set) var state: ServiceState = .idle {
        didSet {
            guard state != oldValue else { return }
            DispatchQueue.main.async { self.onState?(self.state) }
        }
    }

    private var launchProcess: Process?
    private var pollTimer:     Timer?
    private var logSource:     DispatchSourceFileSystemObject?
    private var logHandle:     FileHandle?
    private var failStreak = 0
    private let maxFailStreak = 5   // auto-restart after N consecutive health failures

    // MARK: - Public API

    func start() {
        guard FileManager.default.fileExists(atPath: Paths.launchScript) else {
            set(.failed("Script introuvable :\n\(Paths.launchScript)"))
            return
        }

        stopPoll()
        stopLogWatch()
        state = .starting(progress: "Initialisation…")
        failStreak = 0

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            // Kill any leftover processes from a previous session
            self.terminatePids(wait: false)

            let p = Process()
            p.executableURL = URL(fileURLWithPath: "/bin/bash")
            p.arguments     = [Paths.launchScript]
            var env = ProcessInfo.processInfo.environment
            env["ACCESSIA_BUNDLE_RESOURCES"] = Paths.resources
            env["ACCESSIA_AUTO_CONFIRM"]     = "1"
            p.environment = env
            p.terminationHandler = { _ in }

            do {
                try p.run()
            } catch {
                self.set(.failed(error.localizedDescription))
                return
            }

            DispatchQueue.main.async {
                self.launchProcess = p
                self.startLogWatch()
                self.schedulePoll()
            }
        }
    }

    func stop() {
        stopPoll()
        stopLogWatch()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.terminatePids(wait: true)
            self?.launchProcess?.terminate()
            DispatchQueue.main.async {
                self?.launchProcess = nil
                self?.set(.stopped)
            }
        }
    }

    func restart() {
        set(.starting(progress: "Redémarrage…"))
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.start()
        }
    }

    // MARK: - PID management (autonomous, no stop.sh)

    private func terminatePids(wait: Bool) {
        killPid(at: Paths.backendPid,  wait: wait)
        killPid(at: Paths.frontendPid, wait: wait)
    }

    private func killPid(at path: String, wait: Bool) {
        guard
            let raw = try? String(contentsOfFile: path, encoding: .utf8),
            let pid = pid_t(raw.trimmingCharacters(in: .whitespacesAndNewlines))
        else { return }

        // SIGTERM
        kill(pid, SIGTERM)

        if wait {
            // Poll for up to 4 seconds, then SIGKILL
            var ticks = 0
            while ticks < 8 {
                usleep(500_000)
                if kill(pid, 0) != 0 { break }
                ticks += 1
            }
            kill(pid, SIGKILL) // no-op if already gone
        } else {
            // Async SIGKILL safety net
            let p = pid
            DispatchQueue.global().asyncAfter(deadline: .now() + 4) {
                kill(p, SIGKILL)
            }
        }

        try? FileManager.default.removeItem(atPath: path)
    }

    // MARK: - Health polling

    private func schedulePoll() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.pingHealth()
        }
    }

    private func stopPoll() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func pingHealth() {
        var req = URLRequest(url: Ports.healthURL,
                             cachePolicy: .reloadIgnoringLocalCacheData,
                             timeoutInterval: 2)
        req.httpMethod = "GET"

        URLSession.shared.dataTask(with: req) { [weak self] _, resp, _ in
            guard let self else { return }
            let ok = (resp as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                if ok {
                    self.failStreak = 0
                    if case .running = self.state { return }
                    self.stopPoll()
                    self.stopLogWatch()
                    self.set(.running)
                } else if case .running = self.state {
                    // Monitor health while running
                    self.failStreak += 1
                    if self.failStreak >= self.maxFailStreak {
                        self.restart()
                    }
                }
            }
        }.resume()
    }

    // MARK: - Log watching (live progress during install)

    private func startLogWatch() {
        let fm = FileManager.default
        // Create log dir/file if not yet existing
        let dir = (Paths.logFile as NSString).deletingLastPathComponent
        try? fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
        if !fm.fileExists(atPath: Paths.logFile) {
            fm.createFile(atPath: Paths.logFile, contents: nil)
        }

        guard let fh = FileHandle(forReadingAtPath: Paths.logFile) else { return }
        fh.seekToEndOfFile()
        logHandle = fh

        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fh.fileDescriptor,
            eventMask: .write,
            queue: .global(qos: .background))

        src.setEventHandler { [weak self] in
            guard let self, let fh = self.logHandle else { return }
            let data = fh.readDataToEndOfFile()
            guard !data.isEmpty,
                  let text = String(data: data, encoding: .utf8) else { return }
            let lines = text.components(separatedBy: "\n")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            if let last = lines.last {
                DispatchQueue.main.async {
                    // Strip timestamp prefix "[2026-04-11 00:30:00] "
                    let clean = last.replacingOccurrences(
                        of: #"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] "#,
                        with: "", options: .regularExpression)
                    self.setProgress(clean)
                }
            }
        }

        src.resume()
        logSource = src
    }

    private func stopLogWatch() {
        logSource?.cancel()
        logSource = nil
        logHandle?.closeFile()
        logHandle = nil
    }

    private func setProgress(_ msg: String) {
        if case .starting = state {
            state = .starting(progress: msg)
        }
    }

    private func set(_ s: ServiceState) { state = s }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Loading View
// ─────────────────────────────────────────────────────────────────────────────

final class LoadingView: NSView {

    private let logoView    = NSImageView()
    private let spinner     = NSProgressIndicator()
    private let titleLabel  = NSTextField(labelWithString: "")
    private let progressLbl = NSTextField(labelWithString: "")
    private let actionBtn   = NSButton()

    var onAction: (() -> Void)?

    override init(frame: NSRect) { super.init(frame: frame); setup() }
    required init?(coder: NSCoder) { fatalError() }

    private func setup() {
        wantsLayer = true
        layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        // Logo / icon
        let icnsPath = Paths.resources + "/accessia.icns"
        if let img = NSImage(contentsOfFile: icnsPath) ?? NSImage(named: "NSApplicationIcon") {
            logoView.image = img
        }
        logoView.imageScaling = .scaleProportionallyUpOrDown
        logoView.translatesAutoresizingMaskIntoConstraints = false

        // Spinner
        spinner.style = .spinning
        spinner.controlSize = .regular
        spinner.isIndeterminate = true
        spinner.translatesAutoresizingMaskIntoConstraints = false

        // Title
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)
        titleLabel.alignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        // Progress / detail
        progressLbl.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        progressLbl.textColor = .secondaryLabelColor
        progressLbl.alignment = .center
        progressLbl.maximumNumberOfLines = 2
        progressLbl.lineBreakMode = .byTruncatingMiddle
        progressLbl.translatesAutoresizingMaskIntoConstraints = false

        // Action button
        actionBtn.bezelStyle = .rounded
        actionBtn.keyEquivalent = "\r"
        actionBtn.target = self
        actionBtn.action = #selector(tapped)
        actionBtn.isHidden = true
        actionBtn.translatesAutoresizingMaskIntoConstraints = false

        let stack = NSStackView(views: [logoView, spinner, titleLabel, progressLbl, actionBtn])
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        NSLayoutConstraint.activate([
            logoView.widthAnchor.constraint(equalToConstant: 72),
            logoView.heightAnchor.constraint(equalToConstant: 72),
            progressLbl.widthAnchor.constraint(lessThanOrEqualToConstant: 500),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    @objc private func tapped() { onAction?() }

    func apply(state: ServiceState) {
        switch state {
        case .idle:
            break

        case .starting(let progress):
            spinner.startAnimation(nil)
            spinner.isHidden = false
            titleLabel.stringValue = "Démarrage d'ACCESSIA Pro…"
            progressLbl.stringValue = progress
            progressLbl.isHidden = false
            actionBtn.isHidden = true

        case .stopped:
            spinner.stopAnimation(nil); spinner.isHidden = true
            titleLabel.stringValue = "Services arrêtés"
            progressLbl.isHidden = true
            actionBtn.title = "Démarrer"; actionBtn.isHidden = false

        case .failed(let msg):
            spinner.stopAnimation(nil); spinner.isHidden = true
            titleLabel.stringValue = "Erreur de démarrage"
            progressLbl.stringValue = msg
            progressLbl.isHidden = false
            actionBtn.title = "Réessayer"; actionBtn.isHidden = false

        case .running:
            break
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Content View Controller
// ─────────────────────────────────────────────────────────────────────────────

final class ContentViewController: NSViewController {

    let pm = ProcessManager()

    private var webView:     WKWebView!
    private var loadingView: LoadingView!
    private var webLoaded  = false

    // MARK: View

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 1280, height: 820))
        view.wantsLayer = true

        // WebView (background, initially hidden)
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        // Allow autoplay (for any media in the CRM)
        cfg.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.customUserAgent = "ACCESSIA-Pro/1.0 macOS"
        webView.allowsMagnification = true
        webView.alphaValue = 0
        view.addSubview(webView)

        // Loading overlay (foreground)
        loadingView = LoadingView(frame: view.bounds)
        loadingView.autoresizingMask = [.width, .height]
        loadingView.onAction = { [weak self] in
            guard let self else { return }
            switch self.pm.state {
            case .stopped, .failed: self.pm.restart()
            default: break
            }
        }
        view.addSubview(loadingView)
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadingView.apply(state: .starting(progress: "Initialisation…"))

        pm.onState = { [weak self] state in
            guard let self else { return }
            switch state {
            case .running:
                if !self.webLoaded {
                    self.webLoaded = true
                    self.webView.load(URLRequest(url: Ports.appURL,
                                                cachePolicy: .reloadIgnoringLocalCacheData))
                }
                // Fade will be triggered by webView(_:didFinish:)
            default:
                self.loadingView.apply(state: state)
                self.showLoading()
            }
        }
        pm.start()
    }

    // MARK: Transitions

    func showLoading() {
        guard webView.alphaValue > 0 else { loadingView.isHidden = false; return }
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.2
            webView.animator().alphaValue = 0
        } completionHandler: {
            self.loadingView.isHidden = false
        }
    }

    private func showApp() {
        loadingView.isHidden = true
        NSAnimationContext.runAnimationGroup { ctx in
            ctx.duration = 0.35
            webView.animator().alphaValue = 1
        }
    }

    // MARK: Navigation helpers (called from menu)

    func goBack()    { if webView.canGoBack    { webView.goBack() } }
    func goForward() { if webView.canGoForward { webView.goForward() } }
    func reload()    { webView.reload() }
    func zoomIn()    { webView.magnification = min(webView.magnification * 1.15, 5.0) }
    func zoomOut()   { webView.magnification = max(webView.magnification / 1.15, 0.25) }
    func resetZoom() { webView.magnification = 1.0 }
}

// MARK: - WKNavigationDelegate

extension ContentViewController: WKNavigationDelegate {

    func webView(_ wv: WKWebView, didFinish _: WKNavigation!) {
        showApp()
    }

    func webView(_ wv: WKWebView, didFail _: WKNavigation!, withError _: Error) {
        retryLoad()
    }

    func webView(_ wv: WKWebView,
                 didFailProvisionalNavigation _: WKNavigation!,
                 withError error: Error) {
        let code = (error as NSError).code
        // -1004 = ECONNREFUSED, -1009 = offline — retry silently
        if code == NSURLErrorCannotConnectToHost || code == NSURLErrorNotConnectedToInternet {
            retryLoad()
        }
    }

    private func retryLoad() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, case .running = self.pm.state else { return }
            self.webView.load(URLRequest(url: Ports.appURL))
        }
    }

    func webView(_ wv: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let host = url.host ?? ""
        if host == "localhost" || host == "127.0.0.1" || host.isEmpty {
            decisionHandler(.allow)
        } else {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }
}

// MARK: - WKUIDelegate

extension ContentViewController: WKUIDelegate {

    // File upload picker
    func webView(_ wv: WKWebView,
                 runOpenPanelWith params: WKOpenPanelParameters,
                 initiatedByFrame _: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = params.allowsMultipleSelection
        panel.canChooseFiles = true; panel.canChooseDirectories = false
        panel.begin { completionHandler($0 == .OK ? panel.urls : nil) }
    }

    // JS alert()
    func webView(_ wv: WKWebView,
                 runJavaScriptAlertPanelWithMessage msg: String,
                 initiatedByFrame _: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = "ACCESSIA Pro"; a.informativeText = msg
        a.runModal(); completionHandler()
    }

    // JS confirm()
    func webView(_ wv: WKWebView,
                 runJavaScriptConfirmPanelWithMessage msg: String,
                 initiatedByFrame _: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = "ACCESSIA Pro"; a.informativeText = msg
        a.addButton(withTitle: "OK"); a.addButton(withTitle: "Annuler")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }

    // target=_blank → Safari
    func webView(_ wv: WKWebView,
                 createWebViewWith _: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures _: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Main Window
// ─────────────────────────────────────────────────────────────────────────────

final class MainWindow: NSWindow, NSWindowDelegate {

    let contentVC = ContentViewController()

    convenience init() {
        self.init(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable,
                        .fullSizeContentView, .unifiedTitleAndToolbar],
            backing: .buffered,
            defer: false)

        title = "ACCESSIA Pro"
        titlebarAppearsTransparent = true
        minSize = NSSize(width: 900, height: 620)
        contentViewController = contentVC
        delegate = self

        if !setFrameUsingName("AccesiaMainWindow") { center() }
        setFrameAutosaveName("AccesiaMainWindow")

        setupToolbar()
    }

    // MARK: Toolbar

    private func setupToolbar() {
        let tb = NSToolbar(identifier: "MainToolbar")
        tb.delegate = self
        tb.displayMode = .iconOnly
        tb.showsBaselineSeparator = false
        toolbarStyle = .unified
        toolbar = tb
    }

    // MARK: Window delegate

    func windowWillClose(_ notification: Notification) {
        contentVC.pm.stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            NSApp.terminate(nil)
        }
    }
}

// MARK: - NSToolbarDelegate

extension MainWindow: NSToolbarDelegate {

    func toolbarAllowedItemIdentifiers(_ tb: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.back, .forward, .flexibleSpace, .reload, .flexibleSpace]
    }

    func toolbarDefaultItemIdentifiers(_ tb: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.back, .forward, .flexibleSpace, .reload]
    }

    func toolbar(_ tb: NSToolbar,
                 itemForItemIdentifier id: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar _: Bool) -> NSToolbarItem? {
        switch id {
        case .back:
            return makeToolbarButton(id: id, symbol: "chevron.left",  label: "Précédent",
                                     action: #selector(AppDelegate.goBack(_:)))
        case .forward:
            return makeToolbarButton(id: id, symbol: "chevron.right", label: "Suivant",
                                     action: #selector(AppDelegate.goForward(_:)))
        case .reload:
            return makeToolbarButton(id: id, symbol: "arrow.clockwise", label: "Actualiser",
                                     action: #selector(AppDelegate.reloadPage(_:)))
        default:
            return NSToolbarItem(itemIdentifier: id)
        }
    }

    private func makeToolbarButton(id: NSToolbarItem.Identifier,
                                   symbol: String, label: String,
                                   action: Selector) -> NSToolbarItem {
        let item = NSToolbarItem(itemIdentifier: id)
        item.label = label
        let btn = NSButton()
        btn.image = NSImage(systemSymbolName: symbol, accessibilityDescription: label)
        btn.bezelStyle = .texturedRounded
        btn.isBordered = false
        btn.target = nil   // first responder
        btn.action = action
        item.view = btn
        return item
    }
}

private extension NSToolbarItem.Identifier {
    static let back    = NSToolbarItem.Identifier("back")
    static let forward = NSToolbarItem.Identifier("forward")
    static let reload  = NSToolbarItem.Identifier("reload")
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - App Delegate
// ─────────────────────────────────────────────────────────────────────────────

final class AppDelegate: NSObject, NSApplicationDelegate {

    private var mainWindow: MainWindow!

    func applicationDidFinishLaunching(_ note: Notification) {
        buildMainMenu()
        mainWindow = MainWindow()
        mainWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ note: Notification) {
        mainWindow?.contentVC.pm.stop()
    }

    // Reopen window if user clicks Dock icon
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { mainWindow?.makeKeyAndOrderFront(nil) }
        return true
    }

    // MARK: - Menu actions (routed through responder chain)

    @objc func goBack(_ sender: Any?)    { mainWindow?.contentVC.goBack() }
    @objc func goForward(_ sender: Any?) { mainWindow?.contentVC.goForward() }
    @objc func reloadPage(_ sender: Any?) { mainWindow?.contentVC.reload() }
    @objc func zoomIn(_ sender: Any?)   { mainWindow?.contentVC.zoomIn() }
    @objc func zoomOut(_ sender: Any?)  { mainWindow?.contentVC.zoomOut() }
    @objc func resetZoom(_ sender: Any?) { mainWindow?.contentVC.resetZoom() }
    @objc func restartServices(_ sender: Any?) { mainWindow?.contentVC.pm.restart() }
    @objc func stopServices(_ sender: Any?)    { mainWindow?.contentVC.pm.stop() }
    @objc func openLogs(_ sender: Any?) {
        let path = Paths.logFile
        guard FileManager.default.fileExists(atPath: path) else {
            let a = NSAlert()
            a.messageText = "Journaux introuvables"
            a.informativeText = "Aucun journal disponible.\n\(path)"
            a.alertStyle = .informational; a.runModal(); return
        }
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }

    // MARK: - Main menu

    private func buildMainMenu() {
        let bar = NSMenu()

        // ── App ──
        let appItem = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(withTitle: "À propos d'ACCESSIA Pro",
                        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
                        keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Masquer ACCESSIA Pro",
                        action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quitter ACCESSIA Pro",
                        action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; bar.addItem(appItem)

        // ── Edit (keyboard shortcuts in webview) ──
        let editItem = NSMenuItem(title: "Édition", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "Édition")
        editMenu.addItem(withTitle: "Annuler",           action: Selector(("undo:")),  keyEquivalent: "z")
        editMenu.addItem(withTitle: "Rétablir",          action: Selector(("redo:")),  keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Couper",            action: #selector(NSText.cut(_:)),         keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copier",            action: #selector(NSText.copy(_:)),        keyEquivalent: "c")
        editMenu.addItem(withTitle: "Coller",            action: #selector(NSText.paste(_:)),       keyEquivalent: "v")
        editMenu.addItem(withTitle: "Tout sélectionner", action: #selector(NSText.selectAll(_:)),   keyEquivalent: "a")
        editItem.submenu = editMenu; bar.addItem(editItem)

        // ── Affichage ──
        let viewItem = NSMenuItem(title: "Affichage", action: nil, keyEquivalent: "")
        let viewMenu = NSMenu(title: "Affichage")
        let zoomInI = viewMenu.addItem(withTitle: "Agrandir",     action: #selector(zoomIn),   keyEquivalent: "+")
        zoomInI.target = self
        let zoomOutI = viewMenu.addItem(withTitle: "Réduire",     action: #selector(zoomOut),  keyEquivalent: "-")
        zoomOutI.target = self
        let resetZI  = viewMenu.addItem(withTitle: "Taille réelle", action: #selector(resetZoom), keyEquivalent: "0")
        resetZI.target = self
        viewMenu.addItem(.separator())
        let reloadI = viewMenu.addItem(withTitle: "Actualiser",  action: #selector(reloadPage), keyEquivalent: "r")
        reloadI.target = self
        viewMenu.addItem(.separator())
        let fsItem = viewMenu.addItem(withTitle: "Plein écran",
                                      action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fsItem.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = viewMenu; bar.addItem(viewItem)

        // ── Navigation ──
        let navItem = NSMenuItem(title: "Navigation", action: nil, keyEquivalent: "")
        let navMenu = NSMenu(title: "Navigation")
        let backI = navMenu.addItem(withTitle: "Précédent", action: #selector(goBack), keyEquivalent: "[")
        backI.target = self
        let fwdI = navMenu.addItem(withTitle: "Suivant",    action: #selector(goForward), keyEquivalent: "]")
        fwdI.target = self
        navItem.submenu = navMenu; bar.addItem(navItem)

        // ── Services ──
        let svcItem = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        let svcMenu = NSMenu(title: "Services")
        let rstI = svcMenu.addItem(withTitle: "Redémarrer les services",
                                   action: #selector(restartServices), keyEquivalent: "r")
        rstI.keyEquivalentModifierMask = [.command, .shift]; rstI.target = self
        let stopI = svcMenu.addItem(withTitle: "Arrêter les services",
                                    action: #selector(stopServices), keyEquivalent: "")
        stopI.target = self
        svcMenu.addItem(.separator())
        let logsI = svcMenu.addItem(withTitle: "Voir les journaux",
                                    action: #selector(openLogs), keyEquivalent: "l")
        logsI.keyEquivalentModifierMask = [.command, .option]; logsI.target = self
        svcItem.submenu = svcMenu; bar.addItem(svcItem)

        // ── Fenêtre ──
        let winItem = NSMenuItem(title: "Fenêtre", action: nil, keyEquivalent: "")
        let winMenu = NSMenu(title: "Fenêtre")
        winMenu.addItem(withTitle: "Réduire",     action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        winMenu.addItem(withTitle: "Zoom",        action: #selector(NSWindow.zoom(_:)),        keyEquivalent: "")
        winItem.submenu = winMenu; bar.addItem(winItem)

        NSApp.mainMenu = bar
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Entry Point
// ─────────────────────────────────────────────────────────────────────────────

let app      = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
