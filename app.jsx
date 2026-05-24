// Ferradosa — orders.ferradosa.com
// Single-page React app: landing (bottle wall) + checkout. Box-of-6 only.
// 30% LDW promo is always-on until 14 Jun 2026 (see data.js).

const { useState, useEffect } = React;

function LangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        className={lang === 'pt' ? 'on' : ''}
        onClick={() => setLang('pt')}
        aria-pressed={lang === 'pt'}
      >PT</button>
      <span className="sep">/</span>
      <button
        className={lang === 'en' ? 'on' : ''}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >EN</button>
    </div>
  );
}

function WineName({ wine }) {
  if (wine.name === 'Quinta da Ferradosa') {
    return <>Quinta da <em>Ferradosa</em></>;
  }
  return <>{wine.name} <em>{wine.sub}</em></>;
}

function PriceBlock({ perBottle, t }) {
  const promoActive = window.isPromoActive();
  const boxFull = window.boxPrice(perBottle);
  const boxNow = window.boxPrice(window.discountedPrice(perBottle));
  const bottleNow = window.discountedPrice(perBottle);
  return (
    <div className="price">
      <span className="price-now">{window.fmtEUR(boxNow)}</span>
      {promoActive && (
        <span className="price-was">{window.fmtEUR(boxFull)}</span>
      )}
      <small>{window.fmtEUR(bottleNow)} {t.perBottle}</small>
    </div>
  );
}

function WineCard({ wine, varietal, t, onAdd }) {
  return (
    <div className={'col' + (wine.stock ? '' : ' oos')}>
      <div className="ph">
        <img src={wine.img} alt={`${wine.name} ${wine.sub}`} />
      </div>
      <div className="info">
        <div className="n">
          <span>{t.caseOf6}</span>
          <span>{wine.stock ? t.inStock : t.outOfStock}</span>
        </div>
        <h3><WineName wine={wine} /></h3>
        <div className="sub">{t.vintage} {wine.year} · {varietal}</div>
      </div>
      <div className="row">
        <PriceBlock perBottle={wine.price} t={t} />
        <button onClick={wine.stock ? onAdd : undefined} disabled={!wine.stock}>
          {wine.stock ? t.addCase : t.outOfStock}
        </button>
      </div>
    </div>
  );
}

function PromoBanner({ lang }) {
  const isPt = lang === 'pt';
  const pct = window.LDW_PROMO.percentOff;
  return (
    <div className="promo-banner">
      <strong>LDW PROMO · −{pct}%</strong>
      <span>
        {isPt
          ? 'Desconto aplicado automaticamente · válido até 14 Jun 2026'
          : `${pct}% off — applied automatically · valid until 14 Jun 2026`}
      </span>
    </div>
  );
}

function Landing({ cart, addToCart, lang, setLang, onGoCheckout, promoActive }) {
  const t = window.STRINGS[lang];
  const copy = window.WINE_COPY[lang];
  const count = cart.reduce((n, l) => n + l.qty, 0);
  return (
    <div className="dir-b" data-screen-label="Landing">
      {promoActive && <PromoBanner lang={lang} />}
      <header className="nav">
        <div className="logomark">
          FERRADOSA
          <small>DOURO</small>
        </div>
        <div className="nav-right">
          <LangToggle lang={lang} setLang={setLang} />
          <button className="cart-link" onClick={onGoCheckout}>
            {t.cart} <span className="pill">{count}</span>
          </button>
        </div>
      </header>

      <section className="wall" id="shop">
        {window.WINES.map((w) => (
          <WineCard
            key={w.id}
            wine={w}
            varietal={copy[w.id].varietal}
            t={t}
            onAdd={() => addToCart(w)}
          />
        ))}
      </section>

      <footer className="footer">
        <span>© 2026 Quinta da Ferradosa</span>
        <span>
          {lang === 'pt' ? 'encomendas@ferradosa.com' : 'orders@ferradosa.com'} · +351 917 939 232
        </span>
        <span>Carrazeda de Ansiães · Portugal</span>
      </footer>
    </div>
  );
}

function CartLine({ line, t, setQty, promoActive }) {
  const lineFull = line.qty * window.boxPrice(line.price);
  const lineNow = line.qty * window.boxPrice(window.discountedPrice(line.price));
  return (
    <div className="line">
      <div className="ph"><img src={line.img} alt="" /></div>
      <div>
        <div className="nm"><WineName wine={line} /></div>
        <div className="m">{line.year} · {t.caseOf6}</div>
        <div className="qty">
          <span onClick={() => setQty(line.id, line.qty - 1)}>−</span>
          <span className="n">{line.qty}</span>
          <span onClick={() => setQty(line.id, line.qty + 1)}>+</span>
        </div>
      </div>
      <div className="lp">
        <span className="lp-now">{window.fmtEUR(lineNow)}</span>
        {promoActive && lineFull !== lineNow && (
          <span className="lp-was">{window.fmtEUR(lineFull)}</span>
        )}
      </div>
    </div>
  );
}

function Checkout({ cart, setCart, lang, setLang, onBack, promoActive }) {
  const t = window.STRINGS[lang];
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const subtotalFull = cart.reduce((s, l) => s + l.qty * window.boxPrice(l.price), 0);
  const subtotalNow = cart.reduce(
    (s, l) => s + l.qty * window.boxPrice(window.discountedPrice(l.price)),
    0
  );
  const discount = subtotalFull - subtotalNow;
  const total = subtotalNow;

  const setQty = (id, q) => {
    if (q <= 0) {
      setCart((c) => c.filter((l) => l.id !== id));
    } else {
      setCart((c) => c.map((l) => (l.id === id ? { ...l, qty: q } : l)));
    }
  };

  const handlePlaceOrder = async () => {
    setError(null);
    if (cart.length === 0) return;

    if (!window.CHECKOUT_URL || window.CHECKOUT_URL.includes('REPLACE-ME')) {
      setError(lang === 'pt'
        ? 'Checkout ainda não configurado. Tente novamente em breve.'
        : 'Checkout not configured yet. Please try again shortly.');
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch(window.CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((l) => ({ wine_id: l.id, qty: l.qty })),
          lang,
          successUrl: window.STRIPE_SUCCESS_URL,
          cancelUrl: window.STRIPE_CANCEL_URL,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.url) {
        setError(data.error || (lang === 'pt' ? 'Erro ao iniciar pagamento.' : 'Failed to start checkout.'));
        setSubmitting(false);
        return;
      }
      window.location = data.url;
    } catch (e) {
      setError(e.message || String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="dir-b" data-screen-label="Checkout">
      {promoActive && <PromoBanner lang={lang} />}
      <header className="nav">
        <button className="back-link" onClick={onBack}>{t.backToShop}</button>
        <div className="logomark center-logomark">
          FERRADOSA
          <small>DOURO</small>
        </div>
        <LangToggle lang={lang} setLang={setLang} />
      </header>

      <div className="co">
        <div className="left">
          <h2>{t.checkout}</h2>
          <p className="checkout-note">{t.checkoutNote}</p>
        </div>

        <aside className="right">
          <h3>{t.summary}</h3>
          {cart.length === 0 && (
            <p style={{ opacity: 0.6, fontSize: 13, margin: '12px 0 0' }}>{t.emptyCart}</p>
          )}
          {cart.map((l) => (
            <CartLine key={l.id} line={l} t={t} setQty={setQty} promoActive={promoActive} />
          ))}
          <div className="totals">
            {promoActive && discount > 0 ? (
              <>
                <div className="r"><span>{t.subtotal}</span><span>{window.fmtEUR(subtotalFull)}</span></div>
                <div className="r discount"><span>{t.discount}</span><span>−{window.fmtEUR(discount)}</span></div>
              </>
            ) : (
              <div className="r"><span>{t.subtotal}</span><span>{window.fmtEUR(subtotalNow)}</span></div>
            )}
            <div className="r small"><span>{t.taxIncl}</span><span>—</span></div>
            <div className="r tot"><span>{t.total}</span><span>{window.fmtEUR(total)}</span></div>
          </div>
          <button
            className="place"
            onClick={handlePlaceOrder}
            disabled={cart.length === 0 || submitting}
          >
            {submitting
              ? (lang === 'pt' ? 'A redireccionar…' : 'Redirecting…')
              : t.placeOrder}
          </button>
          {error && <p className="checkout-error">{error}</p>}
          <p className="contact-note">{t.contactNote}</p>
        </aside>
      </div>
    </div>
  );
}

function AgeGate({ onConfirm }) {
  const [denied, setDenied] = useState(false);
  const [lang] = useState(() =>
    (navigator.language || '').toLowerCase().startsWith('pt') ? 'pt' : 'pt'
  );
  const t = window.STRINGS[lang];

  const confirm = () => {
    try { localStorage.setItem('ferradosa-age-confirmed', String(Date.now())); } catch (e) {}
    onConfirm();
  };

  const [q1, q2, q3, q4] = t.ageQuestion;
  const [d1, d2, d3, d4] = t.ageDeniedTitle;

  return (
    <div className="age-gate" data-screen-label="Age Verification">
      <div className="age-bg"></div>
      <div className="age-card">
        <div className="age-mark"><span className="age-num">18+</span></div>
        <div className="age-brand">
          QUINTA DA FERRADOSA
          <small>{t.ageBrandSub}</small>
        </div>

        {!denied ? (
          <>
            <h2 className="age-q">
              {q1}<br/>{q2}<em>{q3}</em>{q4}
            </h2>
            <div className="age-btns">
              <button className="age-yes" onClick={confirm}>{t.ageYes}</button>
              <button className="age-no" onClick={() => setDenied(true)}>{t.ageNo}</button>
            </div>
            <p className="age-fine">{t.ageFine}</p>
          </>
        ) : (
          <>
            <h2 className="age-q">
              {d1}<br/>{d2}<em>{d3}</em>{d4}
            </h2>
            <p className="age-fine">{t.ageDeniedFine}</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Top-level app ──────────────────────────────────────────────────────

const CART_KEY = 'ferradosa-cart-v1';

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((line) => {
        const w = window.WINES.find((x) => x.id === line.id);
        if (!w || !w.stock) return null;
        return { ...w, qty: Math.max(1, parseInt(line.qty, 10) || 1) };
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

function App() {
  const [cart, setCart] = useState(loadCart);
  const [lang, setLang] = useState('pt');
  const [view, setView] = useState('landing');
  const [promoActive] = useState(() => window.isPromoActive());
  const [adult, setAdult] = useState(() => {
    try { return !!localStorage.getItem('ferradosa-age-confirmed'); }
    catch (e) { return false; }
  });

  useEffect(() => {
    try {
      const stripped = cart.map(({ id, qty }) => ({ id, qty }));
      localStorage.setItem(CART_KEY, JSON.stringify(stripped));
    } catch (e) {}
  }, [cart]);

  const addToCart = (w) =>
    setCart((c) => {
      const ex = c.find((l) => l.id === w.id);
      if (ex) return c.map((l) => (l.id === w.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { ...w, qty: 1 }];
    });

  return (
    <>
      {!adult && <AgeGate onConfirm={() => setAdult(true)} />}
      {view === 'checkout' ? (
        <Checkout
          cart={cart}
          setCart={setCart}
          lang={lang}
          setLang={setLang}
          onBack={() => setView('landing')}
          promoActive={promoActive}
        />
      ) : (
        <Landing
          cart={cart}
          addToCart={addToCart}
          lang={lang}
          setLang={setLang}
          onGoCheckout={() => setView('checkout')}
          promoActive={promoActive}
        />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
