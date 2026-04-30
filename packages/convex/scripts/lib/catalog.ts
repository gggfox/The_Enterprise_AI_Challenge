/**
 * Hand-curated catalog for the fictional "Tiendita" Mexican
 * convenience-store chain. All names and brands are deliberately
 * realistic but the chain itself is fictional. Pricing is in MXN
 * (centavos rounded to whole pesos) and reflects mid-2025 retail
 * ballpark figures -- close enough to feel real to a Mexican judge,
 * not so precise that it matters.
 *
 * The generator uses these to populate `categories`, `products`,
 * and `stores`. Anchor SKUs / store codes referenced by the
 * engineered narratives (declining store, star product) are
 * exported as constants so the generator can target them by id.
 */

export interface CategorySeed {
  slug: string
  name_es: string
  // English aliases for the bilingual dictionary; not stored on the
  // Convex `categories` table (per the bilingual decision: Spanish
  // data + LLM-side dictionary).
  aliases_en: readonly string[]
  sortOrder: number
  // Relative weight when sampling a category for a basket item.
  basketWeight: number
}

export interface ProductSeed {
  sku: string
  name_es: string
  categorySlug: string
  priceMxn: number
  // Relative cost margin. costMxn = round(priceMxn * (1 - margin)).
  margin: number
  // Within-category sampling weight for basket composition.
  weight: number
}

export interface StoreSeed {
  code: string
  name_es: string
  city: string
  region: string
  // Days before END_DATE the store opened. Older stores have
  // slightly more loyalty traffic.
  openedDaysAgo: number
}

export const CATEGORIES: readonly CategorySeed[] = [
  {
    slug: 'bebidas',
    name_es: 'Bebidas',
    aliases_en: ['drinks', 'beverages', 'sodas', 'soft drinks', 'water'],
    sortOrder: 1,
    basketWeight: 35,
  },
  {
    slug: 'snacks',
    name_es: 'Snacks',
    aliases_en: ['snacks', 'chips', 'crisps', 'salty snacks', 'botanas'],
    sortOrder: 2,
    basketWeight: 22,
  },
  {
    slug: 'dulces',
    name_es: 'Dulces',
    aliases_en: ['candy', 'sweets', 'chocolates', 'gum'],
    sortOrder: 3,
    basketWeight: 12,
  },
  {
    slug: 'panaderia',
    name_es: 'Panadería',
    aliases_en: ['bakery', 'bread', 'pastries', 'sweet bread', 'pan dulce'],
    sortOrder: 4,
    basketWeight: 8,
  },
  {
    slug: 'abarrotes',
    name_es: 'Abarrotes',
    aliases_en: ['groceries', 'staples', 'pantry', 'canned goods'],
    sortOrder: 5,
    basketWeight: 9,
  },
  {
    slug: 'cuidado_personal',
    name_es: 'Cuidado Personal',
    aliases_en: ['personal care', 'toiletries', 'hygiene', 'health'],
    sortOrder: 6,
    basketWeight: 5,
  },
  {
    slug: 'tabaqueria',
    name_es: 'Tabaquería',
    aliases_en: ['tobacco', 'cigarettes', 'smoking'],
    sortOrder: 7,
    basketWeight: 5,
  },
  {
    slug: 'servicios',
    name_es: 'Servicios',
    aliases_en: [
      'services',
      'top-ups',
      'bill payments',
      'recargas',
      'lottery',
    ],
    sortOrder: 8,
    basketWeight: 4,
  },
] as const

// Product catalog. Manually curated for realism (Mexican convenience
// store SKU mix). ~120 SKUs across 8 categories. Star product is
// `BEB-RB-355` (Red Bull 355ml), grown 3x in the last 6 months.

export const STAR_PRODUCT_SKU = 'BEB-RB-355'

export const PRODUCTS: readonly ProductSeed[] = [
  // ---- Bebidas (drinks) - 30 SKUs --------------------------------------
  { sku: 'BEB-CC-600', name_es: 'Coca-Cola 600ml', categorySlug: 'bebidas', priceMxn: 22, margin: 0.28, weight: 100 },
  { sku: 'BEB-CC-2L', name_es: 'Coca-Cola 2L', categorySlug: 'bebidas', priceMxn: 42, margin: 0.25, weight: 35 },
  { sku: 'BEB-CC-355', name_es: 'Coca-Cola Lata 355ml', categorySlug: 'bebidas', priceMxn: 18, margin: 0.30, weight: 60 },
  { sku: 'BEB-CCZ-600', name_es: 'Coca-Cola Sin Azúcar 600ml', categorySlug: 'bebidas', priceMxn: 22, margin: 0.28, weight: 30 },
  { sku: 'BEB-SP-600', name_es: 'Sprite 600ml', categorySlug: 'bebidas', priceMxn: 22, margin: 0.28, weight: 45 },
  { sku: 'BEB-FA-600', name_es: 'Fanta Naranja 600ml', categorySlug: 'bebidas', priceMxn: 22, margin: 0.28, weight: 30 },
  { sku: 'BEB-PE-600', name_es: 'Pepsi 600ml', categorySlug: 'bebidas', priceMxn: 21, margin: 0.28, weight: 35 },
  { sku: 'BEB-MA-600', name_es: 'Manzanita Sol 600ml', categorySlug: 'bebidas', priceMxn: 21, margin: 0.28, weight: 28 },
  { sku: 'BEB-7UP-600', name_es: '7UP 600ml', categorySlug: 'bebidas', priceMxn: 21, margin: 0.28, weight: 22 },
  { sku: 'BEB-MIR-600', name_es: 'Mirinda 600ml', categorySlug: 'bebidas', priceMxn: 21, margin: 0.28, weight: 18 },
  { sku: 'BEB-JAR-600', name_es: 'Jarritos Tamarindo 600ml', categorySlug: 'bebidas', priceMxn: 18, margin: 0.30, weight: 40 },
  { sku: 'BEB-JAM-600', name_es: 'Jarritos Mandarina 600ml', categorySlug: 'bebidas', priceMxn: 18, margin: 0.30, weight: 35 },
  { sku: 'BEB-SAN-600', name_es: 'Sangría Señorial 600ml', categorySlug: 'bebidas', priceMxn: 19, margin: 0.30, weight: 25 },
  { sku: 'BEB-SQ-600', name_es: 'Squirt 600ml', categorySlug: 'bebidas', priceMxn: 21, margin: 0.28, weight: 22 },
  { sku: 'BEB-BO-500', name_es: 'Boing Mango 500ml', categorySlug: 'bebidas', priceMxn: 16, margin: 0.32, weight: 32 },
  { sku: 'BEB-BG-500', name_es: 'Boing Guayaba 500ml', categorySlug: 'bebidas', priceMxn: 16, margin: 0.32, weight: 28 },
  { sku: 'BEB-JUM-1L', name_es: 'Jumex Mango 1L', categorySlug: 'bebidas', priceMxn: 28, margin: 0.30, weight: 18 },
  { sku: 'BEB-DV-355', name_es: 'Del Valle Durazno 355ml', categorySlug: 'bebidas', priceMxn: 17, margin: 0.32, weight: 25 },
  { sku: 'BEB-CIE-600', name_es: 'Agua Ciel 600ml', categorySlug: 'bebidas', priceMxn: 13, margin: 0.40, weight: 80 },
  { sku: 'BEB-CIE-1.5', name_es: 'Agua Ciel 1.5L', categorySlug: 'bebidas', priceMxn: 19, margin: 0.38, weight: 35 },
  { sku: 'BEB-BON-1.5', name_es: 'Agua Bonafont 1.5L', categorySlug: 'bebidas', priceMxn: 21, margin: 0.36, weight: 30 },
  { sku: 'BEB-EP-600', name_es: 'Epura 600ml', categorySlug: 'bebidas', priceMxn: 13, margin: 0.40, weight: 25 },
  { sku: 'BEB-TC-600', name_es: 'Topo Chico 600ml', categorySlug: 'bebidas', priceMxn: 17, margin: 0.34, weight: 28 },
  { sku: 'BEB-PW-600', name_es: 'Powerade Mora Azul 600ml', categorySlug: 'bebidas', priceMxn: 24, margin: 0.30, weight: 22 },
  { sku: 'BEB-GAT-600', name_es: 'Gatorade Naranja 600ml', categorySlug: 'bebidas', priceMxn: 26, margin: 0.30, weight: 25 },
  { sku: 'BEB-RB-355', name_es: 'Red Bull 355ml', categorySlug: 'bebidas', priceMxn: 52, margin: 0.30, weight: 30 },
  { sku: 'BEB-MO-473', name_es: 'Monster Verde 473ml', categorySlug: 'bebidas', priceMxn: 48, margin: 0.30, weight: 22 },
  { sku: 'BEB-VIVE-355', name_es: 'Vive100 355ml', categorySlug: 'bebidas', priceMxn: 22, margin: 0.34, weight: 18 },
  { sku: 'BEB-NES-220', name_es: 'Nescafé Listo 220ml', categorySlug: 'bebidas', priceMxn: 28, margin: 0.32, weight: 20 },
  { sku: 'BEB-SBX-281', name_es: 'Frappuccino Starbucks 281ml', categorySlug: 'bebidas', priceMxn: 38, margin: 0.30, weight: 16 },

  // ---- Snacks - 22 SKUs ------------------------------------------------
  { sku: 'SNK-SAB-O', name_es: 'Sabritas Original 45g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 100 },
  { sku: 'SNK-SAB-A', name_es: 'Sabritas Adobadas 45g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 80 },
  { sku: 'SNK-SAB-Q', name_es: 'Sabritas Queso y Chile 45g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 55 },
  { sku: 'SNK-DOR-N', name_es: 'Doritos Nacho 62g', categorySlug: 'snacks', priceMxn: 22, margin: 0.32, weight: 75 },
  { sku: 'SNK-DOR-D', name_es: 'Doritos Diablo 62g', categorySlug: 'snacks', priceMxn: 22, margin: 0.32, weight: 70 },
  { sku: 'SNK-DOR-I', name_es: 'Doritos Incógnita 62g', categorySlug: 'snacks', priceMxn: 22, margin: 0.32, weight: 35 },
  { sku: 'SNK-CHE-T', name_es: 'Cheetos Torciditos 52g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 60 },
  { sku: 'SNK-CHE-F', name_es: 'Cheetos Flamin Hot 52g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 65 },
  { sku: 'SNK-RUF-Q', name_es: 'Ruffles Queso 50g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 45 },
  { sku: 'SNK-TAK-F', name_es: 'Takis Fuego 65g', categorySlug: 'snacks', priceMxn: 22, margin: 0.32, weight: 90 },
  { sku: 'SNK-TAK-O', name_es: 'Takis Original 65g', categorySlug: 'snacks', priceMxn: 22, margin: 0.32, weight: 50 },
  { sku: 'SNK-CHI-S', name_es: 'Chicharrón Salsa Verde 30g', categorySlug: 'snacks', priceMxn: 16, margin: 0.34, weight: 40 },
  { sku: 'SNK-CAC-J', name_es: 'Cacahuates Japoneses 80g', categorySlug: 'snacks', priceMxn: 22, margin: 0.32, weight: 30 },
  { sku: 'SNK-PRI-O', name_es: 'Pringles Original 124g', categorySlug: 'snacks', priceMxn: 38, margin: 0.30, weight: 18 },
  { sku: 'SNK-PRI-Q', name_es: 'Pringles Queso 124g', categorySlug: 'snacks', priceMxn: 38, margin: 0.30, weight: 16 },
  { sku: 'SNK-BAR-H', name_es: 'Barcel Hot Nuts 60g', categorySlug: 'snacks', priceMxn: 17, margin: 0.34, weight: 35 },
  { sku: 'SNK-CHU-O', name_es: 'Chips Original 45g', categorySlug: 'snacks', priceMxn: 17, margin: 0.34, weight: 30 },
  { sku: 'SNK-RAN-V', name_es: 'Rancheritos 56g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 32 },
  { sku: 'SNK-CRU-V', name_es: 'Cruji Tacos Salsa Verde 30g', categorySlug: 'snacks', priceMxn: 16, margin: 0.34, weight: 25 },
  { sku: 'SNK-PAL-S', name_es: 'Palomitas Sabritas 32g', categorySlug: 'snacks', priceMxn: 17, margin: 0.34, weight: 22 },
  { sku: 'SNK-FRI-T', name_es: 'Fritos Twists 60g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 18 },
  { sku: 'SNK-MAFER', name_es: 'Cacahuates Mafer Salados 80g', categorySlug: 'snacks', priceMxn: 19, margin: 0.32, weight: 20 },

  // ---- Dulces (candy) - 16 SKUs ----------------------------------------
  { sku: 'DUL-CV-18', name_es: 'Carlos V 18g', categorySlug: 'dulces', priceMxn: 12, margin: 0.34, weight: 60 },
  { sku: 'DUL-MIL-50', name_es: 'Milky Way 52g', categorySlug: 'dulces', priceMxn: 19, margin: 0.32, weight: 30 },
  { sku: 'DUL-SNI-50', name_es: 'Snickers 52g', categorySlug: 'dulces', priceMxn: 22, margin: 0.32, weight: 35 },
  { sku: 'DUL-MM-49', name_es: "M&M's Cacahuate 49g", categorySlug: 'dulces', priceMxn: 22, margin: 0.32, weight: 30 },
  { sku: 'DUL-BUB-4', name_es: 'Bubaloo Tutti Frutti', categorySlug: 'dulces', priceMxn: 3, margin: 0.45, weight: 80 },
  { sku: 'DUL-PEL-22', name_es: 'Pelón Pelo Rico 22g', categorySlug: 'dulces', priceMxn: 11, margin: 0.36, weight: 55 },
  { sku: 'DUL-PUL-20', name_es: 'Pulparindo 20g', categorySlug: 'dulces', priceMxn: 4, margin: 0.45, weight: 90 },
  { sku: 'DUL-VRM-20', name_es: 'Vero Mango 20g', categorySlug: 'dulces', priceMxn: 4, margin: 0.45, weight: 70 },
  { sku: 'DUL-ROC-22', name_es: 'Rockaleta 22g', categorySlug: 'dulces', priceMxn: 5, margin: 0.45, weight: 50 },
  { sku: 'DUL-CHA-12', name_es: 'Chamoy Cucharita 12g', categorySlug: 'dulces', priceMxn: 5, margin: 0.45, weight: 65 },
  { sku: 'DUL-PAN-9', name_es: 'Panditas 9g', categorySlug: 'dulces', priceMxn: 4, margin: 0.42, weight: 45 },
  { sku: 'DUL-TRI-13', name_es: 'Trident Menta 13g', categorySlug: 'dulces', priceMxn: 18, margin: 0.34, weight: 40 },
  { sku: 'DUL-HAL-25', name_es: 'Halls Mentol 25g', categorySlug: 'dulces', priceMxn: 18, margin: 0.34, weight: 32 },
  { sku: 'DUL-DUV-50', name_es: 'Duvalín Bicolor 14g', categorySlug: 'dulces', priceMxn: 4, margin: 0.45, weight: 38 },
  { sku: 'DUL-MAZ-15', name_es: 'Mazapán De La Rosa 15g', categorySlug: 'dulces', priceMxn: 5, margin: 0.42, weight: 50 },
  { sku: 'DUL-PAL-30', name_es: 'Paleta Vero Elote 30g', categorySlug: 'dulces', priceMxn: 5, margin: 0.42, weight: 35 },

  // ---- Panadería - 12 SKUs --------------------------------------------
  { sku: 'PAN-CON-1', name_es: 'Concha Vainilla', categorySlug: 'panaderia', priceMxn: 12, margin: 0.42, weight: 70 },
  { sku: 'PAN-CON-C', name_es: 'Concha Chocolate', categorySlug: 'panaderia', priceMxn: 12, margin: 0.42, weight: 60 },
  { sku: 'PAN-CUE-1', name_es: 'Cuernito', categorySlug: 'panaderia', priceMxn: 14, margin: 0.42, weight: 45 },
  { sku: 'PAN-DON-G', name_es: 'Dona Glaseada', categorySlug: 'panaderia', priceMxn: 14, margin: 0.42, weight: 40 },
  { sku: 'PAN-DON-C', name_es: 'Dona Chocolate', categorySlug: 'panaderia', priceMxn: 16, margin: 0.42, weight: 38 },
  { sku: 'PAN-MAN-4', name_es: 'Mantecadas Bimbo 4pz', categorySlug: 'panaderia', priceMxn: 28, margin: 0.36, weight: 35 },
  { sku: 'PAN-NIT-2', name_es: 'Nito 2pz', categorySlug: 'panaderia', priceMxn: 18, margin: 0.40, weight: 28 },
  { sku: 'PAN-ROL-C', name_es: 'Rol de Canela', categorySlug: 'panaderia', priceMxn: 16, margin: 0.40, weight: 30 },
  { sku: 'PAN-OJO-1', name_es: 'Ojo de Buey', categorySlug: 'panaderia', priceMxn: 14, margin: 0.42, weight: 22 },
  { sku: 'PAN-GAR-1', name_es: 'Garibaldi', categorySlug: 'panaderia', priceMxn: 16, margin: 0.40, weight: 26 },
  { sku: 'PAN-PAY-3', name_es: 'Payaso 3pz', categorySlug: 'panaderia', priceMxn: 22, margin: 0.38, weight: 18 },
  { sku: 'PAN-EMP-Q', name_es: 'Empanada Queso', categorySlug: 'panaderia', priceMxn: 14, margin: 0.42, weight: 25 },

  // ---- Abarrotes - 14 SKUs --------------------------------------------
  { sku: 'ABA-ATU-140', name_es: 'Atún Tuny 140g', categorySlug: 'abarrotes', priceMxn: 24, margin: 0.30, weight: 35 },
  { sku: 'ABA-FRI-560', name_es: 'Frijoles La Costeña 560g', categorySlug: 'abarrotes', priceMxn: 28, margin: 0.28, weight: 30 },
  { sku: 'ABA-MAR-S', name_es: 'Sopa Maruchan Camarón', categorySlug: 'abarrotes', priceMxn: 14, margin: 0.34, weight: 65 },
  { sku: 'ABA-MAR-P', name_es: 'Sopa Maruchan Pollo', categorySlug: 'abarrotes', priceMxn: 14, margin: 0.34, weight: 50 },
  { sku: 'ABA-GAL-M', name_es: 'Galletas Marías Gamesa', categorySlug: 'abarrotes', priceMxn: 18, margin: 0.32, weight: 35 },
  { sku: 'ABA-GAL-E', name_es: 'Galletas Emperador Chocolate', categorySlug: 'abarrotes', priceMxn: 22, margin: 0.32, weight: 32 },
  { sku: 'ABA-PAN-B', name_es: 'Pan Bimbo Blanco Grande', categorySlug: 'abarrotes', priceMxn: 52, margin: 0.26, weight: 22 },
  { sku: 'ABA-TOR-T', name_es: 'Tortillas Tía Rosa 1kg', categorySlug: 'abarrotes', priceMxn: 36, margin: 0.26, weight: 18 },
  { sku: 'ABA-ACE-1L', name_es: 'Aceite 1-2-3 1L', categorySlug: 'abarrotes', priceMxn: 58, margin: 0.24, weight: 14 },
  { sku: 'ABA-SAL-F', name_es: 'Sal La Fina 1kg', categorySlug: 'abarrotes', priceMxn: 18, margin: 0.30, weight: 12 },
  { sku: 'ABA-AZU-Z', name_es: 'Azúcar Zulka 1kg', categorySlug: 'abarrotes', priceMxn: 32, margin: 0.26, weight: 14 },
  { sku: 'ABA-NES-S', name_es: 'Café Nescafé Sobre 7g', categorySlug: 'abarrotes', priceMxn: 8, margin: 0.36, weight: 40 },
  { sku: 'ABA-LEC-1L', name_es: 'Leche Alpura 1L', categorySlug: 'abarrotes', priceMxn: 28, margin: 0.26, weight: 28 },
  { sku: 'ABA-HUE-12', name_es: 'Huevo Bachoco 12pz', categorySlug: 'abarrotes', priceMxn: 52, margin: 0.22, weight: 18 },

  // ---- Cuidado personal - 10 SKUs --------------------------------------
  { sku: 'CUI-PAS-C', name_es: 'Pasta Colgate 75ml', categorySlug: 'cuidado_personal', priceMxn: 32, margin: 0.30, weight: 25 },
  { sku: 'CUI-CEP-O', name_es: 'Cepillo Oral-B', categorySlug: 'cuidado_personal', priceMxn: 38, margin: 0.30, weight: 18 },
  { sku: 'CUI-DES-S', name_es: 'Desodorante Speed Stick 50g', categorySlug: 'cuidado_personal', priceMxn: 42, margin: 0.30, weight: 22 },
  { sku: 'CUI-GEL-E', name_es: 'Gel Ego Sachet 9g', categorySlug: 'cuidado_personal', priceMxn: 8, margin: 0.40, weight: 30 },
  { sku: 'CUI-SHA-S', name_es: 'Shampoo Sedal Sachet 12ml', categorySlug: 'cuidado_personal', priceMxn: 5, margin: 0.42, weight: 35 },
  { sku: 'CUI-TOA-S', name_es: 'Toalla Saba Nocturna 8pz', categorySlug: 'cuidado_personal', priceMxn: 38, margin: 0.30, weight: 22 },
  { sku: 'CUI-PAÑ-H', name_es: 'Pañal Huggies Etapa 4 1pz', categorySlug: 'cuidado_personal', priceMxn: 18, margin: 0.32, weight: 14 },
  { sku: 'CUI-RAS-G', name_es: 'Rastrillo Gillette 2pz', categorySlug: 'cuidado_personal', priceMxn: 28, margin: 0.30, weight: 16 },
  { sku: 'CUI-COND-T', name_es: 'Condones Trojan 3pz', categorySlug: 'cuidado_personal', priceMxn: 42, margin: 0.30, weight: 18 },
  { sku: 'CUI-PAR-T', name_es: 'Tampones Tampax 8pz', categorySlug: 'cuidado_personal', priceMxn: 48, margin: 0.30, weight: 12 },

  // ---- Tabaquería - 8 SKUs --------------------------------------------
  { sku: 'TAB-MAR-R', name_es: 'Marlboro Rojo 20pz', categorySlug: 'tabaqueria', priceMxn: 78, margin: 0.18, weight: 90 },
  { sku: 'TAB-MAR-V', name_es: 'Marlboro Verde 20pz', categorySlug: 'tabaqueria', priceMxn: 78, margin: 0.18, weight: 70 },
  { sku: 'TAB-MAR-G', name_es: 'Marlboro Gold 20pz', categorySlug: 'tabaqueria', priceMxn: 78, margin: 0.18, weight: 55 },
  { sku: 'TAB-CAM-1', name_es: 'Camel Filters 20pz', categorySlug: 'tabaqueria', priceMxn: 76, margin: 0.18, weight: 35 },
  { sku: 'TAB-PAL-1', name_es: 'Pall Mall 20pz', categorySlug: 'tabaqueria', priceMxn: 72, margin: 0.18, weight: 30 },
  { sku: 'TAB-DEL-1', name_es: 'Delicados 20pz', categorySlug: 'tabaqueria', priceMxn: 62, margin: 0.20, weight: 25 },
  { sku: 'TAB-HID-1', name_es: 'Hidalgo 20pz', categorySlug: 'tabaqueria', priceMxn: 60, margin: 0.20, weight: 18 },
  { sku: 'TAB-CER-1', name_es: 'Cerillos Clásicos', categorySlug: 'tabaqueria', priceMxn: 5, margin: 0.50, weight: 60 },

  // ---- Servicios (these are placeholder products; service transactions
  // are generated separately and don't have items) --------------------
  { sku: 'SRV-TEL-50', name_es: 'Recarga Telcel 50', categorySlug: 'servicios', priceMxn: 50, margin: 0.05, weight: 50 },
  { sku: 'SRV-TEL-100', name_es: 'Recarga Telcel 100', categorySlug: 'servicios', priceMxn: 100, margin: 0.05, weight: 35 },
  { sku: 'SRV-TEL-200', name_es: 'Recarga Telcel 200', categorySlug: 'servicios', priceMxn: 200, margin: 0.05, weight: 18 },
  { sku: 'SRV-ATT-50', name_es: 'Recarga AT&T 50', categorySlug: 'servicios', priceMxn: 50, margin: 0.05, weight: 22 },
  { sku: 'SRV-MOV-50', name_es: 'Recarga Movistar 50', categorySlug: 'servicios', priceMxn: 50, margin: 0.05, weight: 14 },
] as const

export const STORES: readonly StoreSeed[] = [
  // CDMX (5)
  { code: 'CDMX-POL', name_es: 'Tiendita Polanco', city: 'Ciudad de México', region: 'CDMX', openedDaysAgo: 1200 },
  { code: 'CDMX-RNO', name_es: 'Tiendita Roma Norte', city: 'Ciudad de México', region: 'CDMX', openedDaysAgo: 980 },
  { code: 'CDMX-COY', name_es: 'Tiendita Coyoacán', city: 'Ciudad de México', region: 'CDMX', openedDaysAgo: 1500 },
  { code: 'CDMX-IZT', name_es: 'Tiendita Iztapalapa', city: 'Ciudad de México', region: 'CDMX', openedDaysAgo: 850 },
  { code: 'CDMX-SF', name_es: 'Tiendita Santa Fe', city: 'Ciudad de México', region: 'CDMX', openedDaysAgo: 720 },
  // Monterrey (3)
  { code: 'MTY-SP', name_es: 'Tiendita San Pedro', city: 'Monterrey', region: 'Nuevo León', openedDaysAgo: 1100 },
  { code: 'MTY-CEN', name_es: 'Tiendita Centro MTY', city: 'Monterrey', region: 'Nuevo León', openedDaysAgo: 1300 },
  { code: 'MTY-VOR', name_es: 'Tiendita Valle Oriente', city: 'Monterrey', region: 'Nuevo León', openedDaysAgo: 600 },
  // Guadalajara (2)
  { code: 'GDL-PRO', name_es: 'Tiendita Providencia', city: 'Guadalajara', region: 'Jalisco', openedDaysAgo: 950 },
  { code: 'GDL-CHA', name_es: 'Tiendita Chapalita', city: 'Guadalajara', region: 'Jalisco', openedDaysAgo: 800 },
] as const

// Engineered narrative anchors -------------------------------------------

// Declining store: -2% MoM revenue trend over the last 6 months. Demo
// question "what store is underperforming?" should land here.
export const DECLINING_STORE_CODE = 'CDMX-IZT'

// Star product: 3x growth over the last 6 months relative to its
// 12-month-prior baseline. Demo question "fastest-growing product".
// Already declared above as STAR_PRODUCT_SKU.

// Underperforming category: 'snacks' is held flat MoM while 'bebidas'
// grows. Demo question "what category is underperforming?".
export const UNDERPERFORMING_CATEGORY_SLUG = 'snacks'

// Region multipliers on basket size (NOT on transaction count, so the
// overall store-volume picture stays clean).
export const REGION_TICKET_MULTIPLIER: Readonly<Record<string, number>> = {
  CDMX: 1.0,
  'Nuevo León': 1.2,
  Jalisco: 0.9,
}

// Service-type catalog. Same labels as the schema literal union.
export const SERVICE_TYPES = [
  'recarga',
  'pago_servicio',
  'transferencia',
  'loteria',
] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const SERVICE_TYPE_AVG_AMOUNT_MXN: Record<ServiceType, number> = {
  recarga: 80,
  pago_servicio: 380,
  transferencia: 1200,
  loteria: 35,
}

export const SERVICE_TYPE_WEIGHT: Record<ServiceType, number> = {
  recarga: 50,
  pago_servicio: 28,
  transferencia: 12,
  loteria: 10,
}

export const SERVICE_TYPE_ALIASES_EN: Record<ServiceType, readonly string[]> = {
  recarga: ['phone top-up', 'mobile recharge', 'top-up'],
  pago_servicio: ['bill payment', 'utility payment', 'service payment'],
  transferencia: ['money transfer', 'remittance', 'wire'],
  loteria: ['lottery', 'lotto'],
}
