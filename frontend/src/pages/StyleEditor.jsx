import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Search, Camera, Shirt, Box, BadgeDollarSign, PackageOpen, Truck, Ruler, Timer,
  ClipboardList,ListChecks
} from 'lucide-react';
import { api } from '../api.js';
import { roundFixed } from '../format.js';
import {
  Field, TextInput, PriceInput, CheckBox, Combo, ConfirmDialog, useToast,
} from '../components/ui.jsx';
import BomSection from '../sections/BomSection.jsx';
import YarnSection from '../sections/YarnSection.jsx';
import PricingSection from '../sections/PricingSection.jsx';
import PackagingSection from '../sections/PackagingSection.jsx';
import ShippingSection from '../sections/ShippingSection.jsx';
import MeasurementsSection from '../sections/MeasurementsSection.jsx';
import OperationsSection from '../sections/OperationsSection.jsx';
import PastSeasons from '../sections/PastSeasons.jsx';

const SECTIONS = [
  { key: 'measurements', label: 'Matrix', icon: Ruler },
  { key: 'bom', label: 'BOM', icon: Box },
  { key: 'yarn', label: 'Yarn', icon: Shirt },
  { key: 'operations', label: 'Operations', icon: Timer },
  { key: 'pricing', label: 'Pricing', icon: BadgeDollarSign },
  { key: 'packaging', label: 'Packaging', icon: PackageOpen },
  { key: 'shipping', label: 'Shipping', icon: Truck },
  
];

// Yarn colours are named, never given a value: "YCA BREAKER WHITE - 658" says
// what to order, not what it looks like. These are the plain colour words that
// appear in the names, so a swatch can be shown for most of them. It is an
// approximation for scanning, not a colour reference — anything unrecognised
// gets a neutral chip rather than a guess.
const COLOR_WORDS = [
  ['BREAKER WHITE', '#F4F2ED'], ['PURE SNOW', '#FAFAF7'], ['ALABASTER', '#EFEAE0'],
  ['IVORY', '#F4EFE2'], ['CREAM', '#F2E8D5'], ['OATMEAL', '#DDD3C0'],
  ['ALMOND BUTTER', '#D8BD93'], ['CAMEL', '#C19A6B'], ['KHAKI', '#B3A078'],
  ['SAND', '#D9C8AC'], ['STONE', '#C8C0B4'], ['CEMENT', '#A9A69F'],
  ['FRIGID GRAY', '#A8AFB2'], ['CHARCOAL', '#43484B'], ['GRAY', '#8E9295'],
  ['GREY', '#8E9295'], ['BLACK', '#23262A'], ['WHITE', '#F6F5F1'],
  ['DARKEST INDIGO', '#232F45'], ['INDIGO', '#31456B'], ['NAVY', '#1F2D4D'],
  ['DENIM', '#4A6484'], ['MYKONOS', '#2F6FA8'], ['ALASKA NIGHT', '#2B3A4A'],
  ['TURQUOISE', '#3AA7A0'], ['TEAL', '#2F6B6B'], ['SAGE', '#9CAD92'],
  ['OLIVE', '#77794A'], ['GREEN', '#5C7A52'], ['MUSTARD', '#C8972F'],
  ['YELLOW', '#D9B23C'], ['ORANGE', '#C97A3E'], ['RUST', '#A8543A'],
  ['BURGUNDY', '#6E2B37'], ['WINE', '#6B2C3A'], ['RED', '#B0413E'],
  ['PINK WHIM', '#DCA3AE'], ['PINK', '#D79AA6'], ['PURPLE', '#6B5183'],
  ['CHOCOLATE', '#4E3A2E'], ['BROWN', '#6B5240'], ['TAN', '#B99A73'],
  ['BEIGE', '#DCCDB4'], ['NATURAL', '#E4DAC6'], ['BLUE', '#3F6390'],
];

/** Approximate swatch for a yarn colour name, or null when nothing matches. */
function swatchFor(name) {
  const n = (name || '').toUpperCase();
  for (const [word, hex] of COLOR_WORDS) {
    if (n.includes(word)) return hex;
  }
  return null;
}

const emptyForm = (season = '') => ({
  name: '', sku_code: '', status: 'active', content_code: '', style_number: '',
  gauge_code: '', material: '', admin_pct: '', knit_minutes_dev: '',
  xs_weight_factor: 0.9, whs_channel: '', finishing_location: '',
  // what the garment is — collected on the Matrix screen
  based_body: '', print_placement: '', bottom_type: '', bottom_rib: '',
  similar_style_past: '', distressed: '', sleeve_category: '',
  sleeve_length: '', length_category: '', yarn_type: '', ply: '',
  season, collection: '', sub_group: '',
  // Unticked until someone says where it sells. Both prices stay locked
  // until then, which is the point: a style with no channel has no price.
  sell_sy: false, sell_000: false,
  sizes: [],
  colorways: [],
  operations: [],
  measurements: [],
  construction: 'MACHINE KNIT', composition_care: '', color_sequence: '', gauge: '',
  tension: 'LIHAT POLA', total_ends: '', logo_label: '', details: '',
  wholesale_price: '', retail_price: '', sy_price: '', sy_sale_price: '',
  price_000: '', sample_price: '',
  bagging_method: 'MIX BULK PACKING', polybag_sticker: 'PCS PER BAG STICKER ONLY', packing_method: 'LGHT VAC PACK', packing_in_box: 'FLAT',
  box_labeling: 'BARCODED SHIPPING LABEL', box_length_cm: '', box_depth_cm: '', box_height_cm: '', pcs_per_box: '',
  ship_via: 'SEA OR AIR OK', hs_code: '', duty_category: '', hang_tag: '',
  special_instructions: 'AS USUAL. NOTHING SPECIAL', notes: '',
});

/** Map a style returned by the API into editable form state. */
function toForm(s) {
  const f = emptyForm();
  for (const k of Object.keys(f)) {
    if (k in s && s[k] !== null && !Array.isArray(f[k])) f[k] = s[k];
  }
  f.status = s.status || 'active';
  f.sell_sy = !!s.sell_sy;
  f.sell_000 = !!s.sell_000;
  f.sizes = (s.sizes || []).map((x) => ({
    size: x.size, weight_kg: x.weight_kg ?? '', pcs_per_box: x.pcs_per_box ?? '',
  }));
  f.colorways = (s.colorways || []).map((cw) => ({
    name: cw.name,
    sub_to: cw.sub_to ?? '',
    sub_reason: cw.sub_reason ?? '',
    subbed_on: cw.subbed_on ?? '',
    bom: (cw.bom || []).map((b) => ({
      yarn: b.yarn ?? '', percent: b.percent ?? '', ends: b.ends ?? '', note: b.note ?? '',
    })),
  }));
  f.operations = (s.operations || []).map((o) => ({
    code: o.code, name: o.name, default_minutes: o.default_minutes,
    minutes: o.minutes ?? '',
  }));
  f.measurements = (s.measurements || []).map((m) => ({
    pom: m.pom, size: m.size ?? '', value_cm: m.value_cm ?? '',
  }));
  return f;
}

export default function StyleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();

  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [section, setSection] = useState('bom');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [costing, setCosting] = useState([]);
  const [preview, setPreview] = useState('');

  const [serverImage, setServerImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const previewUrl = useMemo(
    () => (pendingImage ? URL.createObjectURL(pendingImage) : null), [pendingImage]);
  const fileRef = useRef(null);
  const nameRef = useRef(null);

  const snapshot = useRef('');
  const dirty = JSON.stringify(form) !== snapshot.current || !!pendingImage;

  function hydrate(f, image = null) {
    setForm(f);
    snapshot.current = JSON.stringify(f);
    setServerImage(image);
    setPendingImage(null);
  }

  useEffect(() => {
    api.meta().then((m) => {
      setMeta(m);
      if (!id) {
        const f = emptyForm(m.seasons.at(-1)?.code || '');
        f.sizes = m.sizes.map((size) => ({ size, weight_kg: '' })); // all sizes pre-ticked
        hydrate(f);
      }
    }).catch((e) => showToast(e.message, 'error'));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getStyle(id)
      .then((s) => {
        hydrate(toForm(s), s.image_path);
        setLoading(false);
        api.costing(id).then(setCosting).catch(() => setCosting([]));
      })
      .catch((e) => { showToast(e.message, 'error'); navigate('/browse'); });
  }, [id]); // eslint-disable-line

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));
  const field = (k) => (v) => update({ [k]: v });

  /* ---- top-panel helpers ---- */

  const toggleSize = (size) => (checked) => {
    setForm((f) => {
      const order = meta?.sizes || [];
      const sizes = checked
        ? [...f.sizes, { size, weight_kg: '', pcs_per_box: '' }]
            .sort((a, b) => order.indexOf(a.size) - order.indexOf(b.size))
        : f.sizes.filter((x) => x.size !== size);
      return { ...f, sizes };
    });
  };

  // Which colourway the panel is previewing. Defaults to the first one, which
  // is the top of the BOM, and falls back to it if that colourway is renamed
  // or removed while it is selected.
  const colorNames = form.colorways.map((cw) => cw.name).filter(Boolean);
  const activeColor = colorNames.includes(preview) ? preview : (colorNames[0] || '');
  const activeCw = form.colorways.find((cw) => cw.name === activeColor);

  const primaryColor = form.colorways[0]?.name ?? '';
  const setPrimaryColor = (name) => {
    setForm((f) => {
      const colorways = f.colorways.length
        ? f.colorways.map((cw, i) => (i === 0 ? { ...cw, name } : cw))
        : [{ name, bom: [{ yarn: '', percent: '', ends: '', note: '' }] }];
      return { ...f, colorways };
    });
  };

  /* ---- actions ---- */

  async function save(asDraft = false) {
    if (!form.name.trim()) {
      showToast('Please enter a style name first', 'error');
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, status: asDraft ? 'draft' : 'active' };
      const saved = id
        ? await api.updateStyle(id, payload)
        : await api.createStyle(payload);

      let image = saved.image_path;
      if (pendingImage) {
        const r = await api.uploadImage(saved.id, pendingImage);
        image = r.image_path;
      }
      hydrate(toForm(saved), image);
      api.costing(saved.id).then(setCosting).catch(() => setCosting([]));
      showToast(asDraft ? 'Draft saved' : 'Style saved');
      if (!id) navigate(`/edit/${saved.id}`, { replace: true });
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (dirty) setConfirmDiscard(true);
    else navigate('/browse');
  }

  // The style code is assembled, not typed: K58C3W709 is category, season
  // number, content, gauge, line letter, style number (schema.md §2.3). Three
  // of the six come from the season, so they are shown but not editable.
  const seasonRow = (meta?.seasons || []).find((s) => s.code === form.season);
  const skuParts = [
    seasonRow?.cat_code, seasonRow?.season_number, form.content_code,
    form.gauge_code, seasonRow?.style_letter, form.style_number,
  ];
  const derivedSku = skuParts.every((p) => p !== '' && p != null)
    ? skuParts.join('')
    : '';

  // The checkboxes and the channel say the same thing, so one edit writes
  // both. Otherwise a style could claim SY ONLY with 000 ticked.
  const setChannel = (sy, thousand) =>
    update({
      sell_sy: sy,
      sell_000: thousand,
      whs_channel: sy && thousand ? 'BOTH'
        : sy ? 'SY ONLY'
          : thousand ? '000 ONLY' : '',
    });

  const sectionProps = { form, update, meta, costing };
  const Body = {
    bom: BomSection, yarn: YarnSection, operations: OperationsSection,
    pricing: PricingSection, packaging: PackagingSection,
    shipping: ShippingSection, measurements: MeasurementsSection,
  }[section];

  const imgSrc = previewUrl || serverImage;

  return (
    <>
      {/* ---------- Header ---------- */}
      <header className="band">
        <div className="band-row">
          <Link to="/" className="logo">IM Master</Link>
          <Link to="/matrix" className="band-link"><Ruler size={18} /> Matrix</Link>
          <Link to="/browse" className="band-link"><Search size={18} /> Browse / Edit</Link>
          <Link to="/checklist" className="band-link"><ListChecks size={18} /> Checklist</Link> 
          <Link to="/report" className="band-link"><ClipboardList size={18} /> Report</Link>
          
          <button type="button" className="btn btn-save" disabled={saving || loading}
            onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-ghost" disabled={saving || loading}
            onClick={() => save(true)}>
            Save draft
          </button>
          <button type="button" className="btn btn-dark" disabled={saving}
            onClick={discard}>
            Discard
          </button>
          {form.status === 'draft' && <span className="badge-draft">DRAFT</span>}

          <div className="band-meta">
            <label>Season</label>
            <Combo value={form.season} onChange={field('season')}
              options={meta?.seasons.map((s) => s.code) || []} placeholder="e.g. S27" />
            <label>Collection</label>
            <Combo value={form.collection} onChange={field('collection')}
              options={meta?.collections || []} placeholder="Pick or type new" />
            {/* <label>Sub group</label>
            <Combo value={form.sub_group} onChange={field('sub_group')}
              options={meta?.subGroups || []} placeholder="Pick or type new" /> */}
            {/* Content decides the duty category, and with it every duty and
                landed figure on the Pricing screen. */}
            {/* <label>Content</label>
            <Combo value={form.content_code} onChange={field('content_code')}
              options={meta?.contentCodes || []} placeholder="C, Y, CPE…" />
            <label>Style #</label>
            <TextInput value={form.style_number} onChange={field('style_number')}
              placeholder="709" /> */}
            {/* GAUCE (col D) — the style-code digit, not the knit detail */}
            {/* <label>Gauge code</label>
            <TextInput value={form.gauge_code} onChange={field('gauge_code')}
              placeholder="1" /> */}
          </div>
        </div>
      </header>

      <main className="page">
        {loading ? <div className="spinner" aria-label="Loading style" /> : (
          <>
            <div className="editor-grid">
              {/* ---------- Left: style identity ---------- */}
              <section className="card card-pad style-panel">
                <div>
                  <div className="cw-pick">
                    <select className="input" aria-label="Colourway preview"
                      value={activeColor}
                      disabled={colorNames.length === 0}
                      onChange={(e) => setPreview(e.target.value)}>
                      {colorNames.length === 0
                        ? <option value="">No colourways yet</option>
                        : colorNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {activeCw && (
                      <ul className="cw-yarns">
                        {(activeCw.bom || []).filter((l) => l.yarn).map((l, i) => {
                          const hex = swatchFor(l.yarn);
                          return (
                            <li key={i}>
                              <span className={`cw-dot${hex ? '' : ' unknown'}`}
                                style={hex ? { background: hex } : undefined}
                                title={hex ? 'Approximate, from the name' : 'No colour matched'} />
                              <span className="cw-yarn">{l.yarn}</span>
                              <span className="cw-pct">
                                {l.percent === '' || l.percent == null
                                  ? '' : `${roundFixed(l.percent, 1)}%`}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="style-photo">
                    {imgSrc ? (
                      <img src={imgSrc} alt={form.name || 'Style photo'} />
                    ) : (
                      <div className="placeholder">
                        <Shirt size={56} strokeWidth={1.4} />
                        No photo yet
                      </div>
                    )}
                    <button type="button" className="photo-btn"
                      onClick={() => fileRef.current?.click()}>
                      <Camera size={16} /> {imgSrc ? 'Change photo' : 'Add photo'}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPendingImage(f);
                        e.target.value = '';
                      }} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <Field label="Style">
                    <input ref={nameRef} className="input" value={form.name}
                      placeholder="e.g. MAUI CHUNKY CREW COTTON"
                      onChange={(e) => update({ name: e.target.value })} />
                  </Field>
                  {/* <Field label="Color" hint="First colorway — add more in the BOM section below">
                    <Combo value={primaryColor} onChange={setPrimaryColor}
                      options={meta?.colorNames || []} placeholder="e.g. BEAUJOLAIS" />
                  </Field> */}
                  <div className="sku-block">
                    <div className="group-label">SKU code</div>
                    <div className="sku-parts">
                      <div className="sku-part fixed">
                        <span className="sku-val">{seasonRow?.cat_code || '\u2014'}</span>
                        <span className="sku-cap">Cat</span>
                      </div>
                      <div className="sku-part fixed">
                        <span className="sku-val">{seasonRow?.season_number ?? '\u2014'}</span>
                        <span className="sku-cap">Season</span>
                      </div>
                      <div className="sku-part">
                        <Combo value={form.content_code} onChange={field('content_code')}
                          options={meta?.contentCodes || []} placeholder="C" />
                        <span className="sku-cap">Content</span>
                      </div>
                      <div className="sku-part">
                        <Combo value={form.gauge_code} onChange={field('gauge_code')}
                          options={meta?.options?.gauge || []} placeholder="3" />
                        <span className="sku-cap">Gauge</span>
                      </div>
                      <div className="sku-part fixed">
                        <span className="sku-val">{seasonRow?.style_letter || '\u2014'}</span>
                        <span className="sku-cap">Line</span>
                      </div>
                      <div className="sku-part wide">
                        <TextInput value={form.style_number} onChange={field('style_number')}
                          placeholder="795" />
                        <span className="sku-cap">Style #</span>
                      </div>
                    </div>
                    <div className="sku-result">
                      {derivedSku
                        ? <code>{form.sku_code || derivedSku}</code>
                        : <span className="muted">Pick a season, content, gauge and style number</span>}
                      {form.sku_code && derivedSku && form.sku_code !== derivedSku
                        && <span className="sku-flag">overridden — the parts make {derivedSku}</span>}
                    </div>
                    {/* <Field label="Override" hint="Only when the code does not follow the parts">
                      <TextInput value={form.sku_code} onChange={field('sku_code')}
                        placeholder={derivedSku || 'e.g. K58C3W795'} />
                    </Field> */}
                  </div>

                  {/* <div>
                    <div className="group-label">Sizes</div>
                    <div className="checks-row">
                      {(meta?.sizes || []).map((size) => (
                        <CheckBox key={size} label={size}
                          checked={form.sizes.some((x) => x.size === size)}
                          onChange={toggleSize(size)} />
                      ))}
                    </div>
                  </div> */}

                  <div>
                    <div className="group-label">Sold through</div>
                    <div className="checks-row">
                      <CheckBox label="SY" checked={form.sell_sy}
                        onChange={(v) => setChannel(v, form.sell_000)} />
                      <CheckBox label="000" checked={form.sell_000}
                        onChange={(v) => setChannel(form.sell_sy, v)} />
                    </div>
                    <div className="chan-row">
                      <Field label="Channel" hint="As the IM writes it">
                        <select className="input" value={form.whs_channel || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            update({
                              whs_channel: v,
                              sell_sy: v !== '000 ONLY',
                              sell_000: v !== 'SY ONLY',
                            });
                          }}>
                          <option value="">Not set</option>
                          <option value="SY ONLY">SY ONLY</option>
                          <option value="000 ONLY">000 ONLY</option>
                          <option value="BOTH">BOTH</option>
                        </select>
                      </Field>
                      <Field label="Finishing" hint="At factory or taken home">
                        <select className="input" value={form.finishing_location || ''}
                          onChange={(e) => update({ finishing_location: e.target.value })}>
                          <option value="">Not set</option>
                          <option value="FAF">FAF — at factory</option>
                          <option value="FAH">FAH — take home</option>
                          <option value="BOTH">BOTH</option>
                        </select>
                      </Field>
                    </div>
                  </div>

                  <PastSeasons styleId={id ? Number(id) : null} styleName={form.name}
                    onToast={showToast}
                    onOpen={(other) => navigate(`/edit/${other}`)} />

                  <div className="price-row">
                    {/* <Field label="SY Price"><PriceInput value={form.sy_price} onChange={field('sy_price')} /></Field> */}
                    {/* <Field label="Sale Price"><PriceInput value={form.sy_sale_price} onChange={field('sy_sale_price')} /></Field> */}
                    {/* <Field label="000 Price"><PriceInput value={form.price_000} onChange={field('price_000')} /></Field> */}
                  </div>
                </div>
              </section>

              {/* ---------- Right: section picker ---------- */}
              <section className="card card-pad">
                <h2 className="card-title">Select Section</h2>
                <div className="tiles" style={{ marginTop: 16 }} role="tablist" aria-label="Style sections">
                  {SECTIONS.map(({ key, label, icon: Icon }) => (
                    <button key={key} type="button" role="tab"
                      aria-selected={section === key}
                      className={`tile ${section === key ? 'active' : ''}`}
                      onClick={() => setSection(key)}>
                      <Icon size={30} strokeWidth={1.7} />
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* ---------- Bottom: dynamic editor ---------- */}
            <section className="card card-pad section-card">
              <h2 className="card-title">{SECTIONS.find((s) => s.key === section).label}</h2>
              <div style={{ marginTop: 18 }}>
                <Body {...sectionProps} />
              </div>
            </section>
          </>
        )}
      </main>

      <ConfirmDialog
        open={confirmDiscard}
        danger
        title="Discard changes?"
        message="Everything you changed since the last save will be lost."
        confirmLabel="Yes, discard"
        onConfirm={() => { setConfirmDiscard(false); navigate('/browse'); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
