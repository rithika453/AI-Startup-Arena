'use strict';
/**
 * Business-type signals as [regex source, weight]. Data only - extend freely.
 * `tieOrder` decides the primary type when scores tie (earlier wins).
 */
const BUSINESS_TYPES = {
  marketplace: {
    label: 'Marketplace',
    patterns: [
      ['\\bmarketplaces?\\b', 3], ['\\bbuyers? (and|&|with) sellers?\\b', 3], ['\\bbuy and sell\\b', 3],
      ['\\bconnect(s|ing)?\\b.{0,50}\\b(buyers?|sellers?|vendors?|merchants?)\\b', 3], ['\\baggregator\\b', 2], ['\\btwo-sided\\b', 2],
    ],
  },
  saas: {
    label: 'SaaS',
    patterns: [
      ['\\bsaas\\b', 3], ['\\bsoftware as a service\\b', 3], ['\\bsubscription (software|platform|service)\\b', 2],
      ['\\bb2b (software|platform|tool)\\b', 2], ['\\bcloud[- ]based (platform|software|tool)\\b', 2], ['\\bapi\\b', 1],
      ['\\b(ai|llm)[- ]?(powered|driven)? ?(platform|tool|assistant)\\b', 2], ['\\bchatbots?\\b', 1],
    ],
  },
  mobile_app: {
    label: 'Mobile app',
    patterns: [['\\b(mobile|android|ios|iphone) apps?\\b', 3], ['\\bapp\\b', 1], ['\\bflutter\\b', 2]],
  },
  physical_product: {
    label: 'Physical product',
    patterns: [
      ['\\bphysical products?\\b', 3], ['\\bhardware\\b', 2], ['\\bdevices?\\b', 1], ['\\bgadgets?\\b', 2], ['\\bmanufactur', 2],
      ['\\bpackag(ed|ing)\\b', 1], ['\\b(bottles?|backpacks?|wearables?|cosmetics?|skincare|furniture|snacks?|beverages?|footwear|apparel|appliances?|toys?)\\b', 2],
    ],
  },
  website: {
    label: 'Website',
    patterns: [['\\bwebsites?\\b', 3], ['\\bweb (app|platform|portal)\\b', 3], ['\\bonline portal\\b', 2], ['\\bweb-based\\b', 2]],
  },
  service: {
    label: 'Service business',
    patterns: [
      ['\\bagency\\b', 3], ['\\bconsult(ing|ancy|ants?)\\b', 3], ['\\bfreelanc', 2], ['\\bcoaching\\b', 2], ['\\badvisory\\b', 2],
      ['\\b(we|that) (provide|offer)s?\\b.{0,40}\\bservices?\\b', 3], ['\\bservices?\\b', 1], ['\\bclients?\\b', 1], ['\\bstaffing\\b', 2], ['\\boutsourc', 2],
      ['\\b(cleaning|repair|installation|catering) services?\\b', 3],
    ],
  },
  digital_product: {
    label: 'Digital product',
    patterns: [['\\bdigital products?\\b', 3], ['\\be-?books?\\b', 2], ['\\bonline courses?\\b', 2], ['\\btemplates?\\b', 1], ['\\bplugin\\b', 2], ['\\bsoftware\\b', 1], ['\\bgames?\\b', 1]],
  },
};
const TIE_ORDER = ['marketplace', 'saas', 'mobile_app', 'physical_product', 'website', 'service', 'digital_product'];

module.exports = { BUSINESS_TYPES, TIE_ORDER };
