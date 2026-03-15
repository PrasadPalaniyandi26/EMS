export function Footer() {
  return (
    <footer className="footer-fixed shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
      <div className="w-full flex items-center justify-between">
        <p className="text-xs font-medium text-pure-white">
          © 2023 Income Management System. All rights reserved.
        </p>
        <div className="flex items-center gap-4 text-xs font-medium text-pure-white/80">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400"></span> Service Operational
          </span>
          <span className="text-pure-white/40">|</span>
          <span>Version 10.0.2-B</span>
        </div>
      </div>
    </footer>
  );
}
