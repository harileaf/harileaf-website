import { config, fields, collection, singleton } from '@keystatic/core';

// ============================================================
// Shared field definitions (reused across multiple schemas)
// ============================================================

const seoFields = {
  metaTitle: fields.text({
    label: 'Meta Title',
    description: 'Overrides the page title in search results. Leave blank to use the page title.',
  }),
  metaDescription: fields.text({
    label: 'Meta Description',
    multiline: true,
    description: 'Overrides the page description in search results. Keep under 160 characters.',
  }),
  ogImage: fields.image({
    label: 'OG Image',
    directory: 'public/images/general',
    publicPath: '/images/general/',
    description: 'Social sharing image. Overrides the site default. Recommended size: 1200×630px.',
  }),
  noIndex: fields.checkbox({
    label: 'No Index',
    description: 'Prevent search engines from indexing this page.',
    defaultValue: false,
  }),
};

const socialPlatformOptions = [
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Twitter / X', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'YouTube', value: 'youtube' },
] as const;

const socialLinksField = fields.array(
  fields.object({
    platform: fields.select({
      label: 'Platform',
      options: socialPlatformOptions,
      defaultValue: 'linkedin',
    }),
    url: fields.url({
      label: 'Profile URL',
      validation: { isRequired: true },
    }),
  }),
  {
    label: 'Social Links',
    itemLabel: (props) => props.fields.platform.value,
  }
);

const heroImageFields = (imageDir: string) => ({
  headline: fields.text({
    label: 'Headline',
    validation: { isRequired: true },
  }),
  subheadline: fields.text({
    label: 'Subheadline',
    multiline: true,
    validation: { isRequired: true },
  }),
  image: fields.image({
    label: 'Hero Image',
    directory: `public/images/${imageDir}`,
    publicPath: `/images/${imageDir}/`,
    validation: { isRequired: true },
  }),
});

// ============================================================
// Keystatic configuration
// ============================================================

export default config({
  storage: { kind: 'local' },

  ui: {
    brand: { name: 'Harileaf' },
    navigation: {
      Pages: ['homepage', 'technologyPage', 'farmsPage', 'aboutPage'],
      Global: ['siteSettings', 'navigation', 'footer'],
      Collections: ['farmProfiles', 'techFeatures', 'teamMembers', 'testimonials', 'faqs'],
    },
  },

  // ============================================================
  // SINGLETONS
  // ============================================================

  singletons: {
    // ----------------------------------------------------------
    // Site Settings
    // ----------------------------------------------------------
    siteSettings: singleton({
      label: 'Site Settings',
      path: 'src/content/site-settings',
      schema: {
        title: fields.text({
          label: 'Site Title',
          description: 'Used as the base for all page titles.',
          validation: { isRequired: true },
        }),
        tagline: fields.text({
          label: 'Tagline',
          description: 'Short brand statement used in hero sections and meta tags.',
          validation: { isRequired: true },
        }),
        description: fields.text({
          label: 'Site Description',
          multiline: true,
          description: 'Default meta description used on pages without a custom description.',
          validation: { isRequired: true },
        }),
        logo: fields.image({
          label: 'Logo',
          directory: 'public/images/brand',
          publicPath: '/images/brand/',
          description: 'Main site logo. Used in the header.',
          validation: { isRequired: true },
        }),
        logoDark: fields.image({
          label: 'Logo (Dark Background)',
          directory: 'public/images/brand',
          publicPath: '/images/brand/',
          description: 'Alternative logo for dark backgrounds. Optional.',
        }),
        favicon: fields.image({
          label: 'Favicon',
          directory: 'public/images/brand',
          publicPath: '/images/brand/',
          description: 'Browser tab icon. Minimum 32×32px, square.',
          validation: { isRequired: true },
        }),
        email: fields.text({
          label: 'Contact Email',
          validation: { isRequired: true },
        }),
        phone: fields.text({
          label: 'Phone Number',
          description: 'Include country code, e.g. +91 98765 43210.',
        }),
        address: fields.text({
          label: 'Physical Address',
          multiline: true,
        }),
        socialLinks: socialLinksField,
        defaultOgImage: fields.image({
          label: 'Default OG Image',
          directory: 'public/images/brand',
          publicPath: '/images/brand/',
          description: 'Fallback social sharing image for pages without a custom OG image. 1200×630px.',
          validation: { isRequired: true },
        }),
      },
    }),

    // ----------------------------------------------------------
    // Navigation
    // ----------------------------------------------------------
    navigation: singleton({
      label: 'Navigation',
      path: 'src/content/navigation',
      schema: {
        items: fields.array(
          fields.object({
            label: fields.text({
              label: 'Label',
              validation: { isRequired: true },
            }),
            url: fields.url({
              label: 'URL',
              validation: { isRequired: true },
            }),
            children: fields.array(
              fields.object({
                label: fields.text({
                  label: 'Label',
                  validation: { isRequired: true },
                }),
                url: fields.url({
                  label: 'URL',
                  validation: { isRequired: true },
                }),
              }),
              {
                label: 'Dropdown Items',
                itemLabel: (props) => props.fields.label.value ?? 'Item',
              }
            ),
          }),
          {
            label: 'Navigation Items',
            description: 'Maximum 6 top-level items recommended.',
            itemLabel: (props) => props.fields.label.value ?? 'Item',
          }
        ),
        ctaButton: fields.object(
          {
            label: fields.text({
              label: 'Button Label',
            }),
            url: fields.url({
              label: 'Button URL',
            }),
          },
          { label: 'Header CTA Button' }
        ),
      },
    }),

    // ----------------------------------------------------------
    // Footer
    // ----------------------------------------------------------
    footer: singleton({
      label: 'Footer',
      path: 'src/content/footer',
      schema: {
        columns: fields.array(
          fields.object({
            title: fields.text({
              label: 'Column Title',
              validation: { isRequired: true },
            }),
            links: fields.array(
              fields.object({
                label: fields.text({
                  label: 'Link Label',
                  validation: { isRequired: true },
                }),
                url: fields.url({
                  label: 'URL',
                  validation: { isRequired: true },
                }),
              }),
              {
                label: 'Links',
                itemLabel: (props) => props.fields.label.value ?? 'Link',
              }
            ),
          }),
          {
            label: 'Footer Columns',
            description: '2–4 columns recommended.',
            itemLabel: (props) => props.fields.title.value ?? 'Column',
          }
        ),
        copyrightText: fields.text({
          label: 'Copyright Text',
          description: 'e.g. © 2026 Harileaf. All rights reserved.',
          validation: { isRequired: true },
        }),
        legalLinks: fields.array(
          fields.object({
            label: fields.text({
              label: 'Link Label',
              validation: { isRequired: true },
            }),
            url: fields.url({
              label: 'URL',
              validation: { isRequired: true },
            }),
          }),
          {
            label: 'Legal Links',
            description: 'Privacy Policy, Terms of Service, etc.',
            itemLabel: (props) => props.fields.label.value ?? 'Link',
          }
        ),
      },
    }),

    // ----------------------------------------------------------
    // Homepage
    // ----------------------------------------------------------
    homepage: singleton({
      label: 'Homepage',
      path: 'src/content/homepage',
      schema: {
        hero: fields.object(
          {
            headline: fields.text({
              label: 'Headline',
              description: 'Primary value proposition. Keep under 10 words.',
              validation: { isRequired: true },
            }),
            subheadline: fields.text({
              label: 'Subheadline',
              multiline: true,
              description: 'Supporting text. 1–3 sentences.',
              validation: { isRequired: true },
            }),
            image: fields.image({
              label: 'Hero Image',
              directory: 'public/images/general',
              publicPath: '/images/general/',
              validation: { isRequired: true },
            }),
            ctaPrimary: fields.object(
              {
                label: fields.text({ label: 'Button Label', validation: { isRequired: true } }),
                url: fields.url({ label: 'Button URL', validation: { isRequired: true } }),
              },
              { label: 'Primary CTA' }
            ),
            ctaSecondary: fields.object(
              {
                label: fields.text({ label: 'Button Label' }),
                url: fields.url({ label: 'Button URL' }),
              },
              { label: 'Secondary CTA (optional)' }
            ),
          },
          { label: 'Hero Section' }
        ),

        statsBar: fields.array(
          fields.object({
            value: fields.text({ label: 'Value', description: 'e.g. 32', validation: { isRequired: true } }),
            label: fields.text({ label: 'Label', description: 'e.g. yield increase', validation: { isRequired: true } }),
            suffix: fields.text({ label: 'Suffix', description: 'e.g. %' }),
          }),
          {
            label: 'Stats Bar',
            description: 'Key metrics shown below the hero.',
            itemLabel: (props) => `${props.fields.value.value}${props.fields.suffix.value ?? ''} ${props.fields.label.value ?? ''}`.trim(),
          }
        ),

        problemSection: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            body: fields.document({
              label: 'Body',
              formatting: true,
              dividers: true,
              links: true,
            }),
            image: fields.image({
              label: 'Image',
              directory: 'public/images/general',
              publicPath: '/images/general/',
            }),
          },
          { label: 'Problem Section' }
        ),

        techPreview: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            description: fields.text({
              label: 'Description',
              multiline: true,
              description: 'Optional supporting paragraph.',
            }),
            featureSlugs: fields.array(
              fields.text({ label: 'Feature Slug', description: 'Must match a Tech Features entry slug.' }),
              {
                label: 'Feature Slugs',
                description: 'Slugs of tech feature entries to display. Typically 3.',
                itemLabel: (props) => props.value ?? 'Slug',
              }
            ),
          },
          { label: 'Technology Preview Section' }
        ),

        farmSpotlight: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            farmSlugs: fields.array(
              fields.text({ label: 'Farm Slug', description: 'Must match a Farm Profiles entry slug.' }),
              {
                label: 'Farm Slugs',
                description: 'Slugs of farm profile entries to spotlight. Typically 1–2.',
                itemLabel: (props) => props.value ?? 'Slug',
              }
            ),
          },
          { label: 'Farm Spotlight Section' }
        ),

        impactSection: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            metrics: fields.array(
              fields.object({
                value: fields.text({ label: 'Value', description: 'e.g. 40', validation: { isRequired: true } }),
                label: fields.text({ label: 'Label', description: 'e.g. farms transformed', validation: { isRequired: true } }),
                prefix: fields.text({ label: 'Prefix', description: 'e.g. +' }),
                suffix: fields.text({ label: 'Suffix', description: 'e.g. %' }),
              }),
              {
                label: 'Impact Metrics',
                itemLabel: (props) => `${props.fields.prefix.value ?? ''}${props.fields.value.value ?? ''}${props.fields.suffix.value ?? ''} ${props.fields.label.value ?? ''}`.trim(),
              }
            ),
          },
          { label: 'Impact Section' }
        ),

        ctaSection: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            body: fields.text({
              label: 'Body Text',
              multiline: true,
            }),
            buttons: fields.array(
              fields.object({
                label: fields.text({ label: 'Button Label', validation: { isRequired: true } }),
                url: fields.url({ label: 'Button URL', validation: { isRequired: true } }),
                variant: fields.select({
                  label: 'Variant',
                  options: [
                    { label: 'Primary', value: 'primary' },
                    { label: 'Secondary', value: 'secondary' },
                    { label: 'Ghost', value: 'ghost' },
                  ],
                  defaultValue: 'primary',
                }),
              }),
              {
                label: 'Buttons',
                itemLabel: (props) => props.fields.label.value ?? 'Button',
              }
            ),
          },
          { label: 'CTA Section' }
        ),

        seo: fields.object(seoFields, { label: 'SEO' }),
      },
    }),

    // ----------------------------------------------------------
    // Technology Page
    // ----------------------------------------------------------
    technologyPage: singleton({
      label: 'Technology Page',
      path: 'src/content/technology-page',
      schema: {
        hero: fields.object(
          {
            ...heroImageFields('technology'),
          },
          { label: 'Hero Section' }
        ),

        howItWorks: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            steps: fields.array(
              fields.object({
                title: fields.text({ label: 'Step Title', validation: { isRequired: true } }),
                description: fields.text({ label: 'Description', multiline: true, validation: { isRequired: true } }),
                iconName: fields.text({ label: 'Icon Name', description: 'Identifier for the icon component.' }),
                image: fields.image({
                  label: 'Step Image',
                  directory: 'public/images/technology',
                  publicPath: '/images/technology/',
                }),
              }),
              {
                label: 'Steps',
                description: '3–5 steps recommended.',
                itemLabel: (props) => props.fields.title.value ?? 'Step',
              }
            ),
          },
          { label: 'How It Works Section' }
        ),

        deepDive: fields.array(
          fields.object({
            title: fields.text({ label: 'Section Title', validation: { isRequired: true } }),
            body: fields.document({
              label: 'Content',
              formatting: true,
              dividers: true,
              links: true,
            }),
          }),
          {
            label: 'Deep Dive Sections',
            description: 'Expandable accordion sections with detailed content.',
            itemLabel: (props) => props.fields.title.value ?? 'Section',
          }
        ),

        results: fields.object(
          {
            headline: fields.text({ label: 'Headline' }),
            metrics: fields.array(
              fields.object({
                value: fields.text({ label: 'Value', description: 'e.g. 40', validation: { isRequired: true } }),
                label: fields.text({ label: 'Label', validation: { isRequired: true } }),
                context: fields.text({ label: 'Context', description: 'Additional explanation shown below the metric.' }),
              }),
              {
                label: 'Result Metrics',
                itemLabel: (props) => `${props.fields.value.value ?? ''} ${props.fields.label.value ?? ''}`.trim(),
              }
            ),
          },
          { label: 'Results Section' }
        ),

        research: fields.array(
          fields.object({
            title: fields.text({ label: 'Title', validation: { isRequired: true } }),
            type: fields.select({
              label: 'Type',
              options: [
                { label: 'Research Paper', value: 'paper' },
                { label: 'Case Study', value: 'case-study' },
                { label: 'White Paper', value: 'white-paper' },
                { label: 'News Article', value: 'news' },
              ],
              defaultValue: 'paper',
            }),
            url: fields.url({ label: 'URL', validation: { isRequired: true } }),
            date: fields.date({ label: 'Publication Date' }),
          }),
          {
            label: 'Research & Citations',
            itemLabel: (props) => props.fields.title.value ?? 'Reference',
          }
        ),

        seo: fields.object(seoFields, { label: 'SEO' }),
      },
    }),

    // ----------------------------------------------------------
    // Farms Page
    // ----------------------------------------------------------
    farmsPage: singleton({
      label: 'Farms Page',
      path: 'src/content/farms-page',
      schema: {
        hero: fields.object(
          {
            ...heroImageFields('farm-profiles'),
          },
          { label: 'Hero Section' }
        ),

        introduction: fields.document({
          label: 'Introduction',
          description: 'Optional introductory text shown above the farm grid.',
          formatting: true,
          links: true,
        }),

        aggregateStats: fields.array(
          fields.object({
            value: fields.text({ label: 'Value', description: 'e.g. 120+', validation: { isRequired: true } }),
            label: fields.text({ label: 'Label', description: 'e.g. farms onboarded', validation: { isRequired: true } }),
          }),
          {
            label: 'Aggregate Stats',
            description: 'Platform-wide statistics shown on the farms page.',
            itemLabel: (props) => `${props.fields.value.value ?? ''} ${props.fields.label.value ?? ''}`.trim(),
          }
        ),

        ctaSection: fields.object(
          {
            headline: fields.text({ label: 'Headline' }),
            body: fields.text({ label: 'Body Text', multiline: true }),
            button: fields.object(
              {
                label: fields.text({ label: 'Button Label' }),
                url: fields.url({ label: 'Button URL' }),
              },
              { label: 'CTA Button' }
            ),
          },
          { label: 'CTA Section' }
        ),

        seo: fields.object(seoFields, { label: 'SEO' }),
      },
    }),

    // ----------------------------------------------------------
    // About Page
    // ----------------------------------------------------------
    aboutPage: singleton({
      label: 'About Page',
      path: 'src/content/about-page',
      schema: {
        hero: fields.object(
          {
            headline: fields.text({ label: 'Headline', validation: { isRequired: true } }),
            image: fields.image({
              label: 'Hero Image',
              directory: 'public/images/general',
              publicPath: '/images/general/',
              validation: { isRequired: true },
            }),
          },
          { label: 'Hero Section' }
        ),

        story: fields.document({
          label: 'Our Story',
          description: 'Rich text narrative about the company origin.',
          formatting: true,
          dividers: true,
          links: true,
          images: {
            directory: 'public/images/general',
            publicPath: '/images/general/',
          },
        }),

        timeline: fields.array(
          fields.object({
            year: fields.text({ label: 'Year', description: 'e.g. 2019', validation: { isRequired: true } }),
            title: fields.text({ label: 'Milestone Title', validation: { isRequired: true } }),
            description: fields.text({ label: 'Description', multiline: true }),
          }),
          {
            label: 'Timeline',
            itemLabel: (props) => `${props.fields.year.value ?? ''} — ${props.fields.title.value ?? ''}`.trim(),
          }
        ),

        values: fields.array(
          fields.object({
            title: fields.text({ label: 'Value Title', validation: { isRequired: true } }),
            description: fields.text({ label: 'Description', multiline: true, validation: { isRequired: true } }),
            iconName: fields.text({ label: 'Icon Name', description: 'Identifier for the icon component.' }),
          }),
          {
            label: 'Company Values',
            itemLabel: (props) => props.fields.title.value ?? 'Value',
          }
        ),

        partnersHeadline: fields.text({
          label: 'Partners Section Headline',
          description: 'e.g. "Trusted by leading agricultural institutions"',
        }),

        partnerLogos: fields.array(
          fields.object({
            name: fields.text({ label: 'Partner Name', validation: { isRequired: true } }),
            logo: fields.image({
              label: 'Logo',
              directory: 'public/images/general',
              publicPath: '/images/general/',
            }),
            url: fields.url({ label: 'Partner Website URL' }),
          }),
          {
            label: 'Partner Logos',
            itemLabel: (props) => props.fields.name.value ?? 'Partner',
          }
        ),

        careersSection: fields.object(
          {
            headline: fields.text({ label: 'Headline', description: 'e.g. "Join our team"' }),
            body: fields.text({ label: 'Body Text', multiline: true }),
            url: fields.url({ label: 'Careers Page URL', description: 'Link to job listings.' }),
          },
          { label: 'Careers Section' }
        ),

        contactSection: fields.object(
          {
            headline: fields.text({ label: 'Headline', description: 'e.g. "Get in touch"' }),
            body: fields.text({ label: 'Body Text', multiline: true }),
          },
          { label: 'Contact Section' }
        ),

        seo: fields.object(seoFields, { label: 'SEO' }),
      },
    }),
  },

  // ============================================================
  // COLLECTIONS
  // ============================================================

  collections: {
    // ----------------------------------------------------------
    // Farm Profiles
    // ----------------------------------------------------------
    farmProfiles: collection({
      label: 'Farm Profiles',
      slugField: 'name',
      path: 'src/content/farm-profiles/*',
      format: { data: 'json' },
      schema: {
        name: fields.slug({
          name: {
            label: 'Farm Name',
            description: 'Full name of the farm. Used to generate the URL slug.',
            validation: { isRequired: true },
          },
        }),
        location: fields.text({
          label: 'Location',
          description: 'e.g. "Nashik, Maharashtra, India"',
          validation: { isRequired: true },
        }),
        heroImage: fields.image({
          label: 'Hero Image',
          directory: 'public/images/farm-profiles',
          publicPath: '/images/farm-profiles/',
          description: 'Main photo of the farm.',
          validation: { isRequired: true },
        }),
        cropType: fields.text({
          label: 'Crop Type',
          description: 'e.g. "Grapes", "Wheat", "Tomatoes"',
          validation: { isRequired: true },
        }),
        farmSize: fields.text({
          label: 'Farm Size',
          description: 'e.g. "250 hectares"',
        }),
        challenge: fields.text({
          label: 'Challenge',
          multiline: true,
          description: 'The problem the farmer faced before using Harileaf technology.',
          validation: { isRequired: true },
        }),
        solution: fields.text({
          label: 'Solution',
          multiline: true,
          description: 'How the technology addressed the challenge.',
          validation: { isRequired: true },
        }),
        results: fields.array(
          fields.object({
            metric: fields.text({ label: 'Metric', description: 'e.g. "Yield increase"', validation: { isRequired: true } }),
            value: fields.text({ label: 'Value', description: 'e.g. "32%"', validation: { isRequired: true } }),
            context: fields.text({ label: 'Context', description: 'Additional detail.' }),
          }),
          {
            label: 'Results',
            description: 'Measurable outcomes from using the technology.',
            itemLabel: (props) => `${props.fields.metric.value ?? ''}: ${props.fields.value.value ?? ''}`,
          }
        ),
        farmerQuote: fields.text({
          label: 'Farmer Quote',
          multiline: true,
          description: 'A direct quote from the farmer.',
        }),
        farmerName: fields.text({ label: 'Farmer Name' }),
        farmerRole: fields.text({
          label: 'Farmer Role / Title',
          description: 'e.g. "Owner", "Head of Operations"',
        }),
        gallery: fields.array(
          fields.image({
            label: 'Image',
            directory: 'public/images/farm-profiles',
            publicPath: '/images/farm-profiles/',
          }),
          {
            label: 'Photo Gallery',
            description: 'Additional photos of the farm.',
          }
        ),
        body: fields.document({
          label: 'Extended Story',
          description: 'Optional long-form narrative about the farm and their journey.',
          formatting: true,
          dividers: true,
          links: true,
          images: {
            directory: 'public/images/farm-profiles',
            publicPath: '/images/farm-profiles/',
          },
        }),
        featured: fields.checkbox({
          label: 'Featured',
          description: 'Show this farm on the homepage spotlight.',
          defaultValue: false,
        }),
        publishedAt: fields.date({
          label: 'Published At',
          description: 'Publication date for this farm profile.',
          validation: { isRequired: true },
        }),
        seo: fields.object(seoFields, { label: 'SEO' }),
      },
    }),

    // ----------------------------------------------------------
    // Tech Features
    // ----------------------------------------------------------
    techFeatures: collection({
      label: 'Tech Features',
      slugField: 'title',
      path: 'src/content/tech-features/*',
      format: { data: 'json' },
      schema: {
        title: fields.slug({
          name: {
            label: 'Feature Title',
            description: 'Name of the technology feature.',
            validation: { isRequired: true },
          },
        }),
        iconName: fields.text({
          label: 'Icon Name',
          description: 'Identifier for the icon component (e.g. "satellite", "leaf", "analytics").',
          validation: { isRequired: true },
        }),
        shortDescription: fields.text({
          label: 'Short Description',
          multiline: true,
          description: '1–2 sentences. Shown on cards and preview sections.',
          validation: { isRequired: true },
        }),
        body: fields.document({
          label: 'Detailed Content',
          description: 'Full description of the feature. Used on the technology page.',
          formatting: true,
          dividers: true,
          links: true,
          images: {
            directory: 'public/images/technology',
            publicPath: '/images/technology/',
          },
        }),
        image: fields.image({
          label: 'Feature Image',
          directory: 'public/images/technology',
          publicPath: '/images/technology/',
        }),
        order: fields.integer({
          label: 'Display Order',
          description: 'Lower numbers appear first.',
          validation: { isRequired: true, min: 1 },
        }),
      },
    }),

    // ----------------------------------------------------------
    // Team Members
    // ----------------------------------------------------------
    teamMembers: collection({
      label: 'Team Members',
      slugField: 'name',
      path: 'src/content/team-members/*',
      format: { data: 'json' },
      schema: {
        name: fields.slug({
          name: {
            label: 'Full Name',
            validation: { isRequired: true },
          },
        }),
        role: fields.text({
          label: 'Role / Title',
          description: 'e.g. "Co-Founder & CEO"',
          validation: { isRequired: true },
        }),
        photo: fields.image({
          label: 'Photo',
          directory: 'public/images/team',
          publicPath: '/images/team/',
          description: 'Headshot. Square crop recommended.',
          validation: { isRequired: true },
        }),
        shortBio: fields.text({
          label: 'Short Bio',
          multiline: true,
          description: '1–2 sentences for team cards.',
          validation: { isRequired: true },
        }),
        fullBio: fields.document({
          label: 'Full Bio',
          description: 'Extended biography for the about page.',
          formatting: true,
          links: true,
        }),
        department: fields.text({
          label: 'Department',
          description: 'e.g. "Engineering", "Agronomy", "Business Development"',
        }),
        socialLinks: socialLinksField,
        order: fields.integer({
          label: 'Display Order',
          description: 'Lower numbers appear first.',
          validation: { isRequired: true, min: 1 },
        }),
      },
    }),

    // ----------------------------------------------------------
    // Testimonials
    // ----------------------------------------------------------
    testimonials: collection({
      label: 'Testimonials',
      slugField: 'authorName',
      path: 'src/content/testimonials/*',
      format: { data: 'json' },
      schema: {
        quote: fields.text({
          label: 'Quote',
          multiline: true,
          description: 'The testimonial text. Do not include quotation marks.',
          validation: { isRequired: true },
        }),
        authorName: fields.slug({
          name: {
            label: 'Author Name',
            validation: { isRequired: true },
          },
        }),
        authorRole: fields.text({
          label: 'Author Role / Title',
          description: 'e.g. "Farm Manager"',
        }),
        authorCompany: fields.text({
          label: 'Author Company / Farm',
          description: 'e.g. "Sunrise Orchards"',
        }),
        authorPhoto: fields.image({
          label: 'Author Photo',
          directory: 'public/images/general',
          publicPath: '/images/general/',
          description: 'Headshot. Square crop recommended.',
        }),
        relatedFarmSlug: fields.text({
          label: 'Related Farm Slug',
          description: 'Optional. Must match a Farm Profiles entry slug to link through.',
        }),
        featured: fields.checkbox({
          label: 'Featured',
          description: 'Show this testimonial in featured/highlighted sections.',
          defaultValue: false,
        }),
      },
    }),

    // ----------------------------------------------------------
    // FAQs
    // ----------------------------------------------------------
    faqs: collection({
      label: 'FAQs',
      slugField: 'question',
      path: 'src/content/faqs/*',
      format: { data: 'json' },
      schema: {
        question: fields.slug({
          name: {
            label: 'Question',
            description: 'The FAQ question.',
            validation: { isRequired: true },
          },
        }),
        answer: fields.document({
          label: 'Answer',
          description: 'Rich text answer. Can include bullet points and links.',
          formatting: {
            inlineMarks: { bold: true, italic: true },
            listTypes: { ordered: true, unordered: true },
          },
          links: true,
        }),
        category: fields.select({
          label: 'Category',
          description: 'Used to group FAQs by section.',
          options: [
            { label: 'Technology', value: 'technology' },
            { label: 'Partnership', value: 'partnership' },
            { label: 'General', value: 'general' },
          ],
          defaultValue: 'general',
        }),
        order: fields.integer({
          label: 'Display Order',
          description: 'Lower numbers appear first within the same category.',
          validation: { isRequired: true, min: 1 },
        }),
      },
    }),
  },
});
