import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Search, Camera, Shirt, Box, BadgeDollarSign, PackageOpen, Truck, Ruler, Timer,
} from 'lucide-react';
import { api } from '../api.js';
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

const SECTIONS = [
  { key: 'bom', label: 'BOM', icon: Box },
  { key: 'yarn', label: 'Yarn', icon: Shirt },
  { key: 'operations', label: 'Operations', icon: Timer },
  { key: 'pricing', label: 'Pricing', icon: BadgeDollarSign },
  { key: 'packaging', label: 'Packaging', icon: PackageOpen },
  { key: 'shipping', label: 'Shipping', icon: Truck },
  { key: 'measurements', label: 'Measurements', icon: Ruler },
];

const emptyForm = (season = '') => ({
  name: '', sku_code: '', status: 'active', content_code: '', style_number: '',
  gauge_code: '', material: '', admin_pct: '', knit_minutes_dev: '',
  xs_weight_factor: 0.9,
  season, collection: '', sub_group: '',
  sell_sy: true, sell_000: true,
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
          <Link to="/browse" className="band-link"><Search size={18} /> Browse / Edit</Link>

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
                  <Field label="Color" hint="First colorway — add more in the BOM section below">
                    <Combo value={primaryColor} onChange={setPrimaryColor}
                      options={meta?.colorNames || []} placeholder="e.g. BEAUJOLAIS" />
                  </Field>
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
                        <TextInput value={form.gauge_code} onChange={field('gauge_code')}
                          placeholder="3" />
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
                      <CheckBox label="SY" checked={form.sell_sy} onChange={field('sell_sy')} />
                      <CheckBox label="000" checked={form.sell_000} onChange={field('sell_000')} />
                    </div>
                  </div>

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
