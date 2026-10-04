import { Product } from "../model/product.model.js";
import { Service } from "../model/service.model.js";
import { Category } from "../model/category.model.js";
import { User } from "../model/user.model.js";

const publicVendor = "name firstName lastName storeName country";
const approvedVendor = { $or: [{ role: "seller", vendorStatus: "approved" }, { role: "admin" }] };
const imageUrl = (value) => typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";

export async function getLandingCatalogue(models = { Product, Service, Category, User }) {
  const query = (model, fields) => model.find({ verified: true })
    .select(fields)
    .populate({ path: "vendor", select: publicVendor, match: approvedVendor })
    .populate({ path: "category", select: "name isActive" })
    .sort({ createdAt: -1, _id: -1 }).limit(100).maxTimeMS(5000).lean();
  const [productRows, serviceRows] = await Promise.all([
    query(models.Product, "title detailedDescription price thumbnail photos country packSize vendor category"),
    query(models.Service, "title description images country vendor category"),
  ]);
  const suppliers = new Map();
  const listings = [];
  for (const [rows, type] of [[productRows, "Products"], [serviceRows, "Services"]]) {
    for (const row of rows) {
      // Missing categories can exist in older records. Hide explicitly inactive
      // categories but keep verified listings discoverable as Uncategorized.
      if (!row.vendor || row.category?.isActive === false) continue;
      const vendor = row.vendor;
      const supplierId = String(vendor._id);
      const supplierName = vendor.storeName || vendor.name || [vendor.firstName, vendor.lastName].filter(Boolean).join(" ") || "Supplier";
      const supplier = suppliers.get(supplierId) || {
        id: supplierId, name: supplierName, location: vendor.country || row.country || "", types: [],
      };
      if (!supplier.types.includes(type)) supplier.types.push(type);
      suppliers.set(supplierId, supplier);
      listings.push({
        id: `${type === "Products" ? "product" : "service"}:${row._id}`,
        name: row.title,
        category: row.category?.name || "Uncategorized",
        image: type === "Products" ? imageUrl(row.thumbnail) || imageUrl(row.photos?.[0]?.url) : imageUrl(row.images?.url),
        supplier: supplierName,
        supplierId,
        location: row.country || vendor.country || "",
        // The existing schema has no currency field. Do not invent a currency.
        price: type === "Products" && Number.isFinite(row.price) ? String(row.price) : "On request",
        unit: type === "Products" && row.packSize ? ` / ${row.packSize}` : "",
        tag: "Verified listing",
        description: row.detailedDescription || row.description || "Contact the supplier for more information.",
        type,
      });
    }
  }
  return { listings, suppliers: [...suppliers.values()] };
}
