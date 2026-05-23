export interface Photo {
  key: string;
  label: string;
  url: string;
}

export interface ProduceItem {
  emoji: string;
  name: string;
  category: string;
  seasonal: boolean;
}

export interface ContentFields {
  heroBadge: string;
  heroLine1: string;
  heroLine2: string;
  heroSubtitle: string;
  catalogueHeadline: string;
  photoStripHeadline: string;
  organicPromiseHeadline: string;
}
