import { XMLParser } from "fast-xml-parser";

const DEFAULT_TTL_SECONDS = 30 * 60;
const DEFAULT_PER_PAGE = 10;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

const DEFAULT_BOATSCOM_KEY = "5bd306bd6169";
const DEFAULT_BOATWIZARD_EVENT_ID = "80eef85c-313d-4b83-9053-0cba19e92a93";
const DEFAULT_CURRCONV_KEY = "32e0eac2807f4ce3ac976f8233ed2f06";

const SUPPORTED_CURRENCIES = ["GBP", "EUR", "USD"];
const DEFAULT_LANGUAGE = "en";

let memoryCache = null;

function envInt(name, fallback) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envString(name) {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export function getConfig() {
  return {
    ttlSeconds: envInt("BOATS_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS),
    perPage: envInt("BOATS_PER_PAGE", DEFAULT_PER_PAGE),
    fetchTimeoutMs: envInt("BOATS_FETCH_TIMEOUT_MS", DEFAULT_FETCH_TIMEOUT_MS),
    boatsComKey: envString("BOATSCOM_API_KEY") || DEFAULT_BOATSCOM_KEY,
    boatWizardEventId: envString("BOATWIZARD_EVENT_ID") || DEFAULT_BOATWIZARD_EVENT_ID,
    fxRatesUrl: envString("FX_RATES_URL"),
    currconvKey:
      envString("CURRCONV_API_KEY") || envString("CURRCONV_KEY") || DEFAULT_CURRCONV_KEY,
  };
}

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function formatNumber(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function currencySymbol(curr) {
  switch (curr) {
    case "GBP":
      return "&pound;";
    case "EUR":
      return "&euro;";
    case "USD":
      return "$";
    default:
      return "";
  }
}

function currencyConverter(price, curr, currConvert, convertTo) {
  if (curr === convertTo) {
    return formatNumber(price);
  }

  if (!curr) {
    return formatNumber(price);
  }

  if (!SUPPORTED_CURRENCIES.includes(curr)) {
    return formatNumber(price);
  }

  const rate = currConvert ? Number(currConvert[`${curr}_${convertTo}`]) : NaN;
  if (!Number.isFinite(rate)) {
    return formatNumber(price);
  }

  return formatNumber(Number(price) * rate);
}

function measurementConverter(length, from) {
  const n = Number(length);
  if (!Number.isFinite(n)) return "";
  if (from === "Metres") {
    return Math.round(n * 3.28084);
  }
  return Math.round(n * 0.3048000097536);
}

function currencyPriceLabel(num, curr, noformat) {
  const symbol = currencySymbol(curr);
  if (noformat) {
    return `${symbol}${num ?? ""}`;
  }
  return `${symbol}${formatNumber(num)}`;
}

function taxPaidLabel(value) {
  switch (value) {
    case "Paid":
      return "tax paid";
    case "Not Paid":
      return "tax not paid";
    default:
      return "";
  }
}

function cabinsLabel(num, lang = DEFAULT_LANGUAGE) {
  const n = Number(num);
  if (!Number.isFinite(n) || n === 0) return "";
  if (n === 1) return lang === "en" ? "1 Cabin" : "1 Cabina";
  return lang === "en" ? `${n} Cabins` : `${n} Camarotes`;
}

function passengersLabel(num, lang = DEFAULT_LANGUAGE) {
  const n = Number(num);
  if (!Number.isFinite(n) || n === 0) return "";
  if (n === 1) return lang === "en" ? "1 Passenger" : "1 Pasajero";
  return lang === "en" ? `${n} Passengers` : `${n} Pasajeros`;
}

function maxSpeedLabel(value) {
  if (!value) return "";
  return value.toString().replace(/\|/g, " ");
}

function stripApostrophes(value) {
  if (value == null) return "";
  return value.toString().replace(/\\/g, "").replace(/'/g, "");
}

function parseFormattedNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number.parseFloat(value.toString().replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseBoatsComPrice(priceRaw) {
  if (!priceRaw) return { amount: null, currency: "" };

  const s = priceRaw.toString();
  if (s.length < 4) return { amount: null, currency: "" };

  const currency = s.slice(-3).toUpperCase();
  const numPart = s.slice(0, -4).replace(/,/g, "").trim();
  const amount = Number.parseFloat(numPart);

  if (!Number.isFinite(amount)) return { amount: null, currency };
  if (amount === 0 || amount === 1) return { amount: null, currency };

  return { amount, currency };
}

function extractXmlValue(node) {
  if (node == null) return null;
  if (typeof node === "object") {
    if (Object.prototype.hasOwnProperty.call(node, "#text")) return node["#text"];
    if (Object.prototype.hasOwnProperty.call(node, "text")) return node.text;
    if (Object.prototype.hasOwnProperty.call(node, "value")) return node.value;
  }
  return node;
}

function extractXmlMeasure(node) {
  if (node == null) return { value: null, unit: null };
  if (typeof node === "object") {
    return {
      value: extractXmlValue(node),
      unit: node.unitCode ?? node.unit ?? null,
    };
  }
  return { value: node, unit: null };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.json();
}

async function fetchText(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

async function getCurrConvert(cfg) {
  const timeoutMs = Math.min(cfg.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS, 6000);
  if (cfg.fxRatesUrl) {
    try {
      const fx = await fetchJson(cfg.fxRatesUrl, {}, timeoutMs);
      if (fx && typeof fx === "object") {
        if (fx.base && fx.rates) {
          const base = fx.base.toUpperCase();
          const rates = fx.rates || {};
          const map = {};
          for (const from of SUPPORTED_CURRENCIES) {
            for (const to of SUPPORTED_CURRENCIES) {
              if (from === to) continue;
              const rateFrom = from === base ? 1 : Number(rates[from]);
              const rateTo = to === base ? 1 : Number(rates[to]);
              if (Number.isFinite(rateFrom) && Number.isFinite(rateTo) && rateFrom !== 0) {
                map[`${from}_${to}`] = rateTo / rateFrom;
              }
            }
          }
          return map;
        }

        const map = {};
        for (const [key, value] of Object.entries(fx)) {
          if (!key.includes("_")) continue;
          if (typeof value === "number") {
            map[key] = value;
          } else if (value && typeof value === "object" && "val" in value) {
            map[key] = Number(value.val);
          }
        }
        if (Object.keys(map).length) return map;
      }
    } catch {
      return null;
    }
  }

  if (!cfg.currconvKey) return null;

  try {
    const q = "EUR_GBP,GBP_EUR,USD_GBP,GBP_USD,USD_EUR,EUR_USD";
    const url = `https://api.currconv.com/api/v7/convert?q=${q}&compact=y&apiKey=${encodeURIComponent(
      cfg.currconvKey
    )}`;
    const data = await fetchJson(url, {}, timeoutMs);
    const map = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (!key.includes("_")) continue;
      if (typeof value === "number") {
        map[key] = value;
      } else if (value && typeof value === "object" && "val" in value) {
        map[key] = Number(value.val);
      }
    }
    return map;
  } catch {
    return null;
  }
}

function normalizeBoatsCom(item, currConvert) {
  const idRaw = item?.YachtWorldID ?? item?.DocumentId ?? item?.DocumentID ?? null;
  if (!idRaw) return null;

  const { amount, currency } = parseBoatsComPrice(item?.Price);
  if (amount == null) return null;

  const curr = currency ? currency.toUpperCase() : "";
  const price = Number(amount);

  const price_gbp = currencyConverter(price, curr, currConvert, "GBP");
  const price_eur = currencyConverter(price, curr, currConvert, "EUR");
  const price_usd = currencyConverter(price, curr, currConvert, "USD");

  const length_metre = Number(item?.NormNominalLength);
  const length_metre_value = Number.isFinite(length_metre) ? length_metre : "";
  const length_feet = length_metre_value !== "" ? measurementConverter(length_metre_value, "Metres") : "";

  const cabinsNum = item?.CabinsCountNumeric != null ? Number(item.CabinsCountNumeric) : "";
  const passengersNum =
    item?.MaximumNumberOfPassengersNumeric != null ? Number(item.MaximumNumberOfPassengersNumeric) : "";

  const images = Array.isArray(item?.Images) ? item.Images : [];
  let main_image = "";
  const image = [];

  for (const img of images) {
    const url = img?.Uri || "";
    if (!url) continue;
    if (img?.Priority === 0 && !main_image) {
      main_image = url;
    } else {
      image.push(url);
    }
  }

  return {
    boat_id: idRaw.toString(),
    yachtworld_id: idRaw.toString(),
    make: item?.MakeStringExact ?? "",
    model: item?.ModelExact ?? "",
    year: item?.ModelYear ?? "",
    price,
    price_gbp,
    price_eur,
    price_usd,
    price_title: currencyPriceLabel(price, curr, false),
    price_currency: curr,
    length_metre: length_metre_value,
    length_feet,
    number_of_cabins_num: cabinsNum,
    number_of_cabins: cabinsLabel(cabinsNum),
    tax_status: taxPaidLabel(item?.TaxStatusCode ?? ""),
    max_speed: maxSpeedLabel(item?.MaximumSpeedMeasure ?? ""),
    number_of_passengers:
      passengersNum !== "" ? passengersLabel(passengersNum) : "",
    location: item?.BoatLocation?.BoatCityName ?? "",
    description: Array.isArray(item?.GeneralBoatDescription)
      ? item.GeneralBoatDescription[0]
      : item?.GeneralBoatDescription ?? "",
    engine_make: item?.EngineMakeString ?? "",
    engine_model: item?.EngineModel ?? "",
    engine_fuel_type: item?.EngineFuel ?? "",
    engine_power: item?.TotalEnginePowerQuantity ?? "",
    engine_power_unit: "",
    main_image,
    image,
    feed: "cobrokerage",
  };
}

function normalizeBoatWizardNode(node, currConvert) {
  const header = node?.VehicleRemarketingHeader;
  const detail = node?.VehicleRemarketingBoatLineItem;
  const fine = detail?.VehicleRemarketingBoat;
  const engineLine = detail?.VehicleRemarketingEngineLineItem;
  const engine = engineLine?.VehicleRemarketingEngine;

  const boat_id =
    header?.DocumentIdentificationGroup?.DocumentIdentification?.DocumentID ?? "";

  const priceNode = detail?.PricingABIE?.Price?.ChargeAmount ?? null;
  const priceValue = extractXmlValue(priceNode);
  const price = Number(priceValue);
  const price_currency =
    (priceNode && typeof priceNode === "object" && priceNode.currencyID) ||
    detail?.PricingABIE?.Price?.ChargeAmount?.currencyID ||
    "";

  const curr = price_currency ? price_currency.toString().toUpperCase() : "";
  const priceSafe = Number.isFinite(price) ? price : 0;

  const price_gbp = currencyConverter(priceSafe, curr, currConvert, "GBP");
  const price_eur = currencyConverter(priceSafe, curr, currConvert, "EUR");
  const price_usd = currencyConverter(priceSafe, curr, currConvert, "USD");

  let length_metre = "";
  let length_feet = "";

  const lengthGroup = fine?.BoatLengthGroup;
  const lengths = Array.isArray(lengthGroup) ? lengthGroup : lengthGroup ? [lengthGroup] : [];
  for (const L of lengths) {
    if (L?.BoatLengthCode === "Length Overall") {
      const { value, unit } = extractXmlMeasure(L?.BoatLengthMeasure);
      const lengthValue = Number(value);
      const unitValue = unit || L?.BoatLengthMeasureUnitCode || "";
      if (Number.isFinite(lengthValue)) {
        if (unitValue.toString().toLowerCase().includes("ft")) {
          length_feet = lengthValue;
          length_metre = measurementConverter(lengthValue, "Feet");
        } else {
          length_metre = lengthValue;
          length_feet = measurementConverter(lengthValue, "Metres");
        }
      }
    }
  }

  const cabinsNum = fine?.NumberOfCabinsNumeric != null ? Number(fine.NumberOfCabinsNumeric) : "";
  const passengersNum =
    fine?.MaximumNumberOfPassengersNumeric != null ? Number(fine.MaximumNumberOfPassengersNumeric) : "";

  const maxSpeedMeasure = fine?.MaximumSpeedMeasure;
  let max_speed = "";
  if (maxSpeedMeasure) {
    const { value, unit } = extractXmlMeasure(maxSpeedMeasure);
    const parts = [value, unit].filter(Boolean);
    max_speed = maxSpeedLabel(parts.join(" ").trim());
  }

  const enginePowerNode = engine?.PowerMeasure?.MechanicalEnergyMeasure ?? null;
  const engine_power_value = extractXmlValue(enginePowerNode);
  const engine_power_unit =
    (enginePowerNode && typeof enginePowerNode === "object" && enginePowerNode.unitCode) || "";

  const imagesRaw = detail?.ImageAttachmentExtended;
  const images = Array.isArray(imagesRaw) ? imagesRaw : imagesRaw ? [imagesRaw] : [];
  let main_image = "";
  const image = [];
  for (const img of images) {
    const url = img?.URI || img?.Uri || "";
    if (!url) continue;
    const priority = Number(img?.UsagePreference?.PriorityRankingNumeric);
    if (priority === 0 && !main_image) {
      main_image = url;
    } else {
      image.push(url);
    }
  }

  return {
    boat_id: boat_id.toString(),
    yachtworld_id: "",
    make: fine?.MakeString ?? "",
    model: fine?.Model ?? "",
    year: fine?.ModelYear ?? "",
    price: priceSafe,
    price_gbp,
    price_eur,
    price_usd,
    price_title: currencyPriceLabel(priceSafe, curr, false),
    price_currency: curr,
    length_metre,
    length_feet,
    number_of_cabins_num: cabinsNum,
    number_of_cabins: cabinsLabel(cabinsNum),
    tax_status: taxPaidLabel(detail?.Tax?.TaxStatusCode ?? ""),
    max_speed,
    number_of_passengers:
      passengersNum !== "" ? passengersLabel(passengersNum) : "",
    location: detail?.Location?.LocationAddress?.CityName ?? "",
    description: fine?.GeneralBoatDescription ?? "",
    engine_make: engine?.MakeString ?? "",
    engine_model: engine?.Model ?? "",
    engine_fuel_type: engine?.FuelTypeCode ?? "",
    engine_power: engine_power_value ?? "",
    engine_power_unit: engine_power_unit ?? "",
    main_image,
    image,
    feed: "ventura",
  };
}

export async function fetchAndBuildBaseDataset() {
  const cfg = getConfig();

  if (!cfg.boatsComKey) throw new Error("Missing env var BOATSCOM_API_KEY");
  if (!cfg.boatWizardEventId) throw new Error("Missing env var BOATWIZARD_EVENT_ID");

  const boatsComUrl =
    "https://services.boats.com/pls/boats/search" +
    "?fields=DocumentId,YachtWorldID,CabinsCountNumeric,MaximumNumberOfPassengersNumeric,EngineMakeString,EngineModel,EngineFuel,TotalEnginePowerQuantity,BoatLocation,ModelYear,GeneralBoatDescription,MaximumSpeedMeasure,TaxStatusCode,ModelExact,Images,Price,NormNominalLength,MakeStringExact" +
    "&rows=1000" +
    `&key=${encodeURIComponent(cfg.boatsComKey)}` +
    "&currency=original";

  const boatWizardUrl = `https://services.boatwizard.com/bridge/events/${encodeURIComponent(
    cfg.boatWizardEventId
  )}/boats?status=on`;

  const source_status = {
    boatscom: { ok: true, error: null },
    boatwizard: { ok: true, error: null },
  };

  let boatsComItems = [];
  let boatWizardNodes = [];

  const [currResult, boatsComResult, boatWizardResult] = await Promise.allSettled([
    getCurrConvert(cfg),
    fetchJson(boatsComUrl, {}, cfg.fetchTimeoutMs),
    fetchText(boatWizardUrl, {}, cfg.fetchTimeoutMs),
  ]);

  const currConvert =
    currResult.status === "fulfilled" && currResult.value ? currResult.value : {};

  if (boatsComResult.status === "fulfilled") {
    const boatsComJson = boatsComResult.value;
    boatsComItems = Array.isArray(boatsComJson?.data?.results) ? boatsComJson.data.results : [];
  } else {
    source_status.boatscom = { ok: false, error: boatsComResult.reason?.message || "boatscom failed" };
  }

  if (boatWizardResult.status === "fulfilled") {
    const xmlText = boatWizardResult.value;
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const parsed = parser.parse(xmlText);
    const root = parsed?.ArrayOfVehicleRemarketing || parsed;
    const nodes = root?.VehicleRemarketing;
    boatWizardNodes = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
  } else {
    source_status.boatwizard = {
      ok: false,
      error: boatWizardResult.reason?.message || "boatwizard failed",
    };
  }

  const boatsComData = boatsComItems
    .map((item) => normalizeBoatsCom(item, currConvert))
    .filter(Boolean);

  const boatWizardData = boatWizardNodes
    .map((node) => normalizeBoatWizardNode(node, currConvert))
    .filter((b) => b && b.boat_id);

  const mergedMap = new Map();
  for (const boat of boatWizardData) {
    mergedMap.set(boat.boat_id.toString(), boat);
  }
  for (const boat of boatsComData) {
    const key = boat.boat_id.toString();
    if (!mergedMap.has(key)) mergedMap.set(key, boat);
  }

  const merged = Array.from(mergedMap.values());
  merged.sort((a, b) => toNumberOrZero(a.price) - toNumberOrZero(b.price));

  return {
    last_updated: new Date().toISOString(),
    stale: false,
    source_status,
    data: merged,
  };
}

function isExpired(cached, ttlSeconds) {
  if (!cached?.last_updated) return true;
  const ts = Date.parse(cached.last_updated);
  if (!Number.isFinite(ts)) return true;
  return (Date.now() - ts) / 1000 > ttlSeconds;
}

export async function getCachedBaseDataset({ forceRefresh = false } = {}) {
  const cfg = getConfig();
  const cachedData = memoryCache;
  const expired = cachedData ? isExpired(cachedData, cfg.ttlSeconds) : true;

  if (!forceRefresh && cachedData && !expired) {
    return cachedData;
  }

  const built = await fetchAndBuildBaseDataset();
  memoryCache = built;
  return built;
}

export function applyQueryFiltering(base, url) {
  const cfg = getConfig();
  const params = url.searchParams;

  const currencyVal = stripApostrophes(params.get("currencyVal") || "").trim() || "EUR";
  const measurementVal = stripApostrophes(params.get("measurementVal") || "").trim() || "Metres";
  const sortby = stripApostrophes(params.get("sortby") || "").trim() || "low";
  const pagenumParam = params.get("pagenum") || params.get("page") || "1";
  const pagenum = Math.max(1, Number.parseInt(pagenumParam, 10) || 1);

  const priceCol =
    currencyVal === "GBP"
      ? "price_gbp"
      : currencyVal === "EUR"
      ? "price_eur"
      : currencyVal === "USD"
      ? "price_usd"
      : "price_gbp";

  const measurementCol = measurementVal === "Feet" ? "length_feet" : "length_metre";

  let rows = Array.isArray(base?.data) ? base.data.slice() : [];

  const brands = stripApostrophes(params.get("brands") || "");
  if (brands !== "") {
    rows = rows.filter((b) => (b.make ?? "") === brands);
  }

  const pricefrom = stripApostrophes(params.get("pricefrom") || "");
  if (pricefrom !== "") {
    const priceVal = Number(pricefrom) * 1_000_000;
    if (Number.isFinite(priceVal)) {
      rows = rows.filter((b) => parseFormattedNumber(b[priceCol]) >= priceVal);
    }
  }

  const priceto = stripApostrophes(params.get("priceto") || "");
  if (priceto !== "") {
    const priceVal = Number(priceto) * 1_000_000;
    if (Number.isFinite(priceVal)) {
      rows = rows.filter((b) => parseFormattedNumber(b[priceCol]) < priceVal);
    }
  }

  const lengthfrom = stripApostrophes(params.get("lengthfrom") || "");
  if (lengthfrom !== "") {
    const lenVal = Number(lengthfrom);
    if (Number.isFinite(lenVal)) {
      rows = rows.filter((b) => Number(b[measurementCol] ?? 0) >= lenVal);
    }
  }

  const lengthto = stripApostrophes(params.get("lengthto") || "");
  if (lengthto !== "") {
    const lenVal = Number(lengthto);
    if (Number.isFinite(lenVal)) {
      rows = rows.filter((b) => Number(b[measurementCol] ?? 0) <= lenVal);
    }
  }

  const yearfrom = stripApostrophes(params.get("yearfrom") || "");
  if (yearfrom !== "") {
    const yearVal = Number(yearfrom);
    if (Number.isFinite(yearVal)) {
      rows = rows.filter((b) => Number(b.year ?? 0) >= yearVal);
    }
  }

  const yearto = stripApostrophes(params.get("yearto") || "");
  if (yearto !== "") {
    const yearVal = Number(yearto);
    if (Number.isFinite(yearVal)) {
      rows = rows.filter((b) => Number(b.year ?? 0) <= yearVal);
    }
  }

  const mincabins = stripApostrophes(params.get("mincabins") || "");
  if (mincabins !== "") {
    const cabinsVal = Number(mincabins);
    if (Number.isFinite(cabinsVal)) {
      rows = rows.filter((b) => Number(b.number_of_cabins_num ?? 0) >= cabinsVal);
    }
  }

  const keywordsearch = stripApostrophes(params.get("keywordsearch") || "").trim();
  if (keywordsearch !== "") {
    const searchWords = keywordsearch.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((b) => {
      const makeModel = stripApostrophes(`${b.make ?? ""} ${b.model ?? ""}`.toLowerCase());
      const findWords = makeModel.split(/\s+/).filter(Boolean);
      return searchWords.every((word) => findWords.includes(word));
    });
  }

  if (sortby === "high") {
    rows.sort((a, b) => toNumberOrZero(b.price) - toNumberOrZero(a.price));
  } else if (sortby === "lengthshort") {
    rows.sort((a, b) => toNumberOrZero(a.length_metre) - toNumberOrZero(b.length_metre));
  } else if (sortby === "lengthlong") {
    rows.sort((a, b) => toNumberOrZero(b.length_metre) - toNumberOrZero(a.length_metre));
  } else {
    rows.sort((a, b) => toNumberOrZero(a.price) - toNumberOrZero(b.price));
  }

  const total = rows.length;
  const perPage = cfg.perPage;
  const lastpage = Math.max(1, Math.ceil(total / perPage));
  const nextpage = pagenum < lastpage ? pagenum + 1 : lastpage;
  const prevpage = pagenum > 1 ? pagenum - 1 : 1;

  const minCount = (pagenum - 1) * perPage;
  const maxCount = minCount + perPage + 1;
  const paged = [];
  let counter = 0;
  for (const boat of rows) {
    counter += 1;
    if (counter < maxCount && counter > minCount) {
      paged.push(boat);
    }
  }

  return {
    meta: {
      pagenum,
      per_page: perPage,
      total,
      lastpage,
      nextpage,
      prevpage,
      sortby,
      currencyVal,
      measurementVal,
      last_updated: base?.last_updated ?? null,
      stale: base?.stale ?? false,
      source_status: base?.source_status ?? null,
    },
    data: paged,
  };
}
