"use client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Code, Sparkles, Zap } from "lucide-react";
import { generateWebsite } from "./actions";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#050508] text-white overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&display=swap');

        body { font-family: 'Manrope', sans-serif; }

        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(130px);
          opacity: 0.13;
          pointer-events: none;
          animation: floatOrb 14s ease-in-out infinite;
          z-index: 0;
        }
        .orb-1 { width: 700px; height: 700px; background: radial-gradient(circle, #3b82f6, #6366f1); top: -250px; left: -200px; animation-delay: 0s; }
        .orb-2 { width: 500px; height: 500px; background: radial-gradient(circle, #8b5cf6, #06b6d4); top: 50px; right: -150px; animation-delay: -5s; }
        .orb-3 { width: 450px; height: 450px; background: radial-gradient(circle, #06b6d4, #3b82f6); bottom: 100px; left: 35%; animation-delay: -9s; }

        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(25px, -35px) scale(1.04); }
          66% { transform: translate(-18px, 18px) scale(0.96); }
        }

        .grid-bg {
          background-image:
            linear-gradient(rgba(99,102,241,0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.045) 1px, transparent 1px);
          background-size: 64px 64px;
        }

        .nav-glass {
          background: rgba(5,5,8,0.75);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border-bottom: 1px solid rgba(255,255,255,0.055);
        }

        .glass-card {
          background: rgba(255,255,255,0.025);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255,255,255,0.065);
          border-radius: 18px;
          transition: border-color 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
        }
        .glass-card:hover {
          border-color: rgba(99,102,241,0.35);
          transform: translateY(-3px);
          box-shadow: 0 16px 48px rgba(99,102,241,0.08);
        }

        .gradient-border-wrap {
          position: relative;
          border-radius: 20px;
          background: rgba(255,255,255,0.025);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
        .gradient-border-wrap::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 20px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(99,102,241,0.55), rgba(139,92,246,0.55), rgba(6,182,212,0.25));
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: destination-out;
          mask-composite: exclude;
          pointer-events: none;
        }

        .gradient-text {
          background: linear-gradient(135deg, #60a5fa, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .gradient-text-teal {
          background: linear-gradient(135deg, #22d3ee, #60a5fa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .cta-btn {
          position: relative;
          overflow: hidden;
          background: linear-gradient(135deg, #3b82f6, #6366f1, #8b5cf6);
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: 'Manrope', sans-serif;
          font-weight: 600;
          color: white;
          border-radius: 14px;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .cta-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #60a5fa, #818cf8, #a78bfa);
          opacity: 0;
          transition: opacity 0.25s ease;
        }
        .cta-btn:hover::after { opacity: 1; }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 0 36px rgba(99,102,241,0.45); }
        .cta-btn > * { position: relative; z-index: 1; }

        .nav-link {
          color: rgba(255,255,255,0.5);
          font-size: 0.875rem;
          font-weight: 500;
          text-decoration: none;
          position: relative;
          padding-bottom: 3px;
          transition: color 0.2s ease;
          font-family: 'Manrope', sans-serif;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0;
          width: 0; height: 1px;
          background: linear-gradient(90deg, #60a5fa, #818cf8);
          transition: width 0.3s ease;
        }
        .nav-link:hover { color: rgba(255,255,255,0.9); }
        .nav-link:hover::after { width: 100%; }

        /* ✅ Plain textarea — fully interactive, no shadcn interference */
        .prompt-input {
          width: 100%;
          min-height: 148px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px;
          color: white;
          font-family: 'Manrope', sans-serif;
          font-size: 0.9375rem;
          font-weight: 300;
          line-height: 1.7;
          padding: 16px;
          resize: vertical;
          outline: none;
          pointer-events: all;
          cursor: text;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          display: block;
        }
        .prompt-input:focus {
          border-color: rgba(99,102,241,0.5);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .prompt-input::placeholder { color: rgba(255,255,255,0.18); }

        .badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 5px 14px;
          border-radius: 999px;
          background: rgba(99,102,241,0.1);
          border: 1px solid rgba(99,102,241,0.22);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #a5b4fc;
          font-family: 'Manrope', sans-serif;
        }

        .glow-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #60a5fa;
          box-shadow: 0 0 10px #60a5fa, 0 0 20px rgba(96,165,250,0.4);
          flex-shrink: 0;
          display: inline-block;
        }

        .feature-icon-box {
          width: 52px; height: 52px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 18px;
        }

        .step-num {
          font-size: 0.65rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(99,102,241,0.6);
          margin-bottom: 10px;
          font-family: 'Manrope', sans-serif;
        }

        .footer-link {
          color: rgba(255,255,255,0.3);
          font-size: 0.875rem;
          font-weight: 400;
          text-decoration: none;
          transition: color 0.2s ease;
          font-family: 'Manrope', sans-serif;
        }
        .footer-link:hover { color: rgba(255,255,255,0.65); }

        .fade-up { opacity: 0; transform: translateY(28px); animation: fadeUp 0.75s ease forwards; }
        @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
        .d1 { animation-delay: 0.05s; }
        .d2 { animation-delay: 0.15s; }
        .d3 { animation-delay: 0.25s; }
        .d4 { animation-delay: 0.35s; }
        .d5 { animation-delay: 0.45s; }
        .d6 { animation-delay: 0.55s; }

        .section-wrap { max-width: 1100px; margin: 0 auto; padding: 0 32px; }
      `}</style>

      {/* Backgrounds */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="fixed inset-0 grid-bg pointer-events-none" style={{ zIndex: 0 }} />

      {/* ── Nav ── */}
      <header className="nav-glass fixed top-0 left-0 right-0" style={{ zIndex: 50 }}>
        <div className="section-wrap" style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={16} color="white" />
            </div>
            <span style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>BlinkBuild</span>
          </div>

          <nav style={{ display: 'flex', gap: 32 }}>
            <a href="#features" className="nav-link">Features</a>
            <a href="#how-it-works" className="nav-link">How it works</a>
            <a href="#contact" className="nav-link">Contact</a>
          </nav>

          <button
  className="cta-btn"
  style={{ padding: '9px 20px', fontSize: '0.875rem' }}
  onClick={() => document.getElementById('prompt')?.focus()}
>
  Get Started →
</button>
        </div>
      </header>

      {/* ── Main ── */}
      <main style={{ position: 'relative', zIndex: 10, flex: 1, paddingTop: 128, paddingBottom: 80 }}>

        {/* Hero */}
        <div className="section-wrap" style={{ textAlign: 'center', marginBottom: 64 }}>
          <div className="fade-up d1" style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div className="badge-pill">
              <span className="glow-dot" />
              AI-Powered Website Generation
            </div>
          </div>

          <h1 className="fade-up d2" style={{
            fontFamily: 'Manrope,sans-serif',
            fontSize: 'clamp(2.4rem,5.5vw,4.25rem)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.035em',
            marginBottom: 24,
          }}>
            Build websites that<br />
            <span className="gradient-text">think for themselves</span>
          </h1>

          <p className="fade-up d3" style={{
            color: 'rgba(255,255,255,0.42)',
            fontSize: '1.0625rem',
            fontWeight: 300,
            maxWidth: 520,
            margin: '0 auto',
            lineHeight: 1.75,
          }}>
            Describe your vision. Our AI architects the perfect website — production-ready code, beautiful design, deployed in seconds.
          </p>
        </div>

        {/* ── Form Card ── */}
        <div className="section-wrap fade-up d4" style={{ marginBottom: 96 }}>
          <div className="gradient-border-wrap" style={{ maxWidth: 640, margin: '0 auto', padding: '36px 40px' }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.2rem', fontWeight: 700, marginBottom: 6, letterSpacing: '-0.02em' }}>
                What do you want to build?
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: '0.875rem', fontWeight: 300 }}>
                Describe your website — purpose, style, features, anything.
              </p>
            </div>

            {/* ✅ Native form with plain <textarea> — always clickable */}
            <form action={generateWebsite}>
              <div style={{ marginBottom: 20 }}>
                <label htmlFor="prompt" style={{
                  display: 'block',
                  fontFamily: 'Manrope,sans-serif',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.38)',
                  marginBottom: 10,
                }}>
                  Your Prompt
                </label>
                <textarea
                  id="prompt"
                  name="prompt"
                  className="prompt-input"
                  placeholder="e.g., Create a sleek SaaS landing page for a project management tool. Dark theme, glassmorphism cards, animated hero, pricing section with 3 tiers..."
                  required
                />
              </div>

              <button
                type="submit"
                className="cta-btn"
                style={{ width: '100%', padding: '14px 24px', fontSize: '0.9375rem', borderRadius: 14 }}
              >
                <Zap size={17} />
                Generate My Website
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.75rem', color: 'rgba(255,255,255,0.18)', fontWeight: 300, fontFamily: 'Manrope,sans-serif' }}>
              No account required · Ready in under 10 seconds
            </p>
          </div>
        </div>

        {/* ── Features ── */}
        <div id="features" className="section-wrap" style={{ marginBottom: 96 }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="fade-up d1" style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div className="badge-pill">
                <span className="glow-dot" style={{ background: '#a78bfa', boxShadow: '0 0 10px #a78bfa' }} />
                Why BlinkBuild
              </div>
            </div>
            <h2 className="fade-up d2" style={{
              fontFamily: 'Manrope,sans-serif',
              fontSize: 'clamp(1.6rem,3.5vw,2.5rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}>
              Everything you need,{' '}
              <span className="gradient-text">nothing you don't</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20, maxWidth: 960, margin: '0 auto' }}>
            {[
              { icon: <Sparkles size={21} />, color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', title: 'AI-Powered', delay: 'd3', desc: 'Advanced models understand nuance, intent, and design principles to craft exactly what you envision.' },
              { icon: <Zap size={21} />, color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', title: 'Lightning Fast', delay: 'd4', desc: 'From blank canvas to production-ready website in seconds. No waiting, no friction.' },
              { icon: <Code size={21} />, color: '#22d3ee', bg: 'rgba(34,211,238,0.1)', title: 'Production Ready', delay: 'd5', desc: "Clean, optimized, accessible code that's ready to deploy. Not prototypes — real products." },
            ].map(f => (
              <div key={f.title} className={`glass-card fade-up ${f.delay}`} style={{ padding: '28px 28px 32px' }}>
                <div className="feature-icon-box" style={{ background: f.bg }}>
                  <span style={{ color: f.color, display: 'flex' }}>{f.icon}</span>
                </div>
                <h3 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1rem', fontWeight: 700, marginBottom: 10, letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.33)', fontSize: '0.875rem', fontWeight: 300, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── How it works ── */}
        <div id="how-it-works" className="section-wrap" style={{ marginBottom: 96 }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="fade-up d1" style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div className="badge-pill">
                <span className="glow-dot" style={{ background: '#22d3ee', boxShadow: '0 0 10px #22d3ee' }} />
                Simple Process
              </div>
            </div>
            <h2 className="fade-up d2" style={{
              fontFamily: 'Manrope,sans-serif',
              fontSize: 'clamp(1.6rem,3.5vw,2.5rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
            }}>
              Three steps to your
              <span className="gradient-text-teal"> perfect site</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 20, maxWidth: 900, margin: '0 auto' }}>
            {[
              { step: '01', title: 'Describe', delay: 'd3', desc: 'Type your idea in plain English. Be as vague or as detailed as you want — our AI fills in the gaps.' },
              { step: '02', title: 'Generate', delay: 'd4', desc: 'Our AI builds your full website — pages, components, styles, and logic — in seconds.' },
              { step: '03', title: 'Deploy', delay: 'd5', desc: 'Preview live, tweak it, and ship to the world instantly. Zero config required.' },
            ].map(s => (
              <div key={s.step} className={`glass-card fade-up ${s.delay}`} style={{ padding: '28px 28px 32px' }}>
                <div className="step-num">Step {s.step}</div>
                <h4 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.0625rem', fontWeight: 700, marginBottom: 10, letterSpacing: '-0.01em' }}>{s.title}</h4>
                <p style={{ color: 'rgba(255,255,255,0.33)', fontSize: '0.875rem', fontWeight: 300, lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA Banner ── */}
        <div className="section-wrap fade-up d3">
          <div className="gradient-border-wrap" style={{ maxWidth: 740, margin: '0 auto', padding: '56px 48px', textAlign: 'center' }}>
            <h2 style={{
              fontFamily: 'Manrope,sans-serif',
              fontSize: 'clamp(1.6rem,3.5vw,2.4rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              marginBottom: 14,
            }}>
              Ready to build something
              <span className="gradient-text"> extraordinary?</span>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9375rem', fontWeight: 300, marginBottom: 32 }}>
              Join thousands of makers shipping faster with BlinkBuild.
            </p>
            <button
              className="cta-btn"
              style={{ padding: '13px 32px', fontSize: '0.9375rem', borderRadius: 14 }}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Start Building Free →
            </button>
          </div>
        </div>

      </main>

      {/* ── Footer ── */}
      <footer id="contact" style={{ position: 'relative', zIndex: 10, marginTop: 80, background: '#08080d', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Top section — brand + columns */}
        <div className="section-wrap" style={{ paddingTop: 64, paddingBottom: 48 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, flexWrap: 'wrap' }}>

            {/* Brand column */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Zap size={16} color="white" />
                </div>
                <span style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>BlinkBuild</span>
              </div>
              <p style={{ fontFamily: 'Manrope,sans-serif', color: 'rgba(255,255,255,0.28)', fontSize: '0.875rem', fontWeight: 300, lineHeight: 1.75, maxWidth: 240 }}>
                AI-powered website generation. From idea to production in seconds.
              </p>
              {/* Social icons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                {[
                  { label: 'X', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
                  { label: 'GH', path: 'M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z' },
                  { label: 'LI', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
                ].map(s => (
                  <a key={s.label} href="#" style={{
                    width: 36, height: 36,
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.2s, border-color 0.2s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.15)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.3)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
                      <path d={s.path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Product column */}
            <div>
              <h5 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 18 }}>Product</h5>
              {['Features', 'How it works', 'Pricing', 'Changelog'].map(l => (
                <a key={l} href="#" className="footer-link" style={{ display: 'block', marginBottom: 12 }}>{l}</a>
              ))}
            </div>

            {/* Resources column */}
            <div>
              <h5 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 18 }}>Resources</h5>
              {['Documentation', 'Blog', 'Templates', 'API'].map(l => (
                <a key={l} href="#" className="footer-link" style={{ display: 'block', marginBottom: 12 }}>{l}</a>
              ))}
            </div>

            {/* Company column */}
            <div>
              <h5 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 18 }}>Company</h5>
              {['About', 'Careers', 'Privacy', 'Terms'].map(l => (
                <a key={l} href="#" className="footer-link" style={{ display: 'block', marginBottom: 12 }}>{l}</a>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="section-wrap" style={{ paddingTop: 20, paddingBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontFamily: 'Manrope,sans-serif', color: 'rgba(255,255,255,0.18)', fontSize: '0.8rem', fontWeight: 300 }}>
              © 2025 BlinkBuild. All rights reserved.
            </p>
            <div style={{ display: 'flex', gap: 20 }}>
              {['Privacy Policy', 'Terms of Service', 'Cookies'].map(l => (
                <a key={l} href="#" style={{ fontFamily: 'Manrope,sans-serif', color: 'rgba(255,255,255,0.18)', fontSize: '0.8rem', fontWeight: 300, textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.18)'}
                >{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}