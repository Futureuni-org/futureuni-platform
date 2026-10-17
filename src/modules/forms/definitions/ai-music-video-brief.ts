/**
 * AI Music Video Brief — the first Client Forms definition (docs/specs/module-forms.md §2).
 *
 * The questions, their order and their wording come from the approved standalone prototype (kept
 * with the owner's inputs, outside the repository; see docs/specs/module-forms.md §2). Field keys
 * match that prototype, so the plain-text brief the prospect copies reads the same as the one the
 * team already reviewed.
 *
 * Changing any question means bumping `version`: a stored submission records the version it
 * answered, and a brief must always be readable against the questions that produced it.
 */

import type { FormDefinition } from "@/contracts/forms";

export const aiMusicVideoBrief: FormDefinition = {
  slug: "ai-music-video-brief",
  title: "AI Music Video Brief",
  eyebrow: "FUTUREUNI",
  version: 1,
  status: "PUBLISHED",
  serviceLine: "VIDEO_EDITING",
  intro: [
    "Thank you for trusting us with your music video. These questions help us understand the song, the look you want and the feeling you are after, so the first concept we show you is already close.",
  ],
  expectation:
    "Thirteen short sections, about ten minutes. You do not need every answer figured out — write what you know and leave the rest. Your answers save on this device as you go.",
  sections: [
    {
      key: "your-details",
      title: "Your details",
      intro: "So we know who to reply to.",
      fields: [
        {
          key: "yourName",
          kind: "shortText",
          label: "Your name",
          required: true,
          width: "half",
          role: "contactName",
        },
        {
          key: "artistName",
          kind: "shortText",
          label: "Artist or stage name",
          required: true,
          width: "half",
        },
        {
          key: "email",
          kind: "email",
          label: "Email",
          required: true,
          width: "half",
          role: "contactEmail",
        },
        {
          key: "phone",
          kind: "phone",
          label: "Phone or WhatsApp",
          required: true,
          width: "half",
          role: "contactPhone",
        },
      ],
    },
    {
      key: "the-song",
      title: "The song",
      intro: "What we are making the video for.",
      fields: [
        { key: "songTitle", kind: "shortText", label: "Song title", required: true, width: "half" },
        {
          key: "genre",
          kind: "shortText",
          label: "Genre",
          width: "half",
          placeholder: "Afrobeats, gospel, amapiano, R&B…",
        },
        {
          key: "collab",
          kind: "singleChoice",
          label: "Solo song or a collaboration?",
          choices: [
            { value: "Solo", label: "Solo" },
            { value: "Collaboration", label: "A collaboration" },
          ],
        },
        {
          key: "collabWho",
          kind: "shortText",
          label: "If it is a collaboration, who features on it?",
          placeholder: "Their name, and whether they should appear in the video",
        },
        {
          key: "songAbout",
          kind: "longText",
          label: "What is the song about, and what should people feel when they hear it?",
          placeholder: "In your own words.",
          briefLabel: "What the song is about",
        },
      ],
    },
    {
      key: "the-track",
      title: "The track",
      intro: "We work to the exact audio, so we need the version you are releasing.",
      note: "We match every cut and every lip-sync to the audio. If the mix changes later, that work has to be redone.",
      fields: [
        {
          key: "trackLink",
          kind: "url",
          label: "Link to the song",
          help: 'If it is easier to send the file on WhatsApp, write "sending on WhatsApp" here and send it after.',
          placeholder: "Google Drive, Dropbox, WeTransfer, Audiomack, SoundCloud…",
          required: true,
        },
        {
          key: "trackStatus",
          kind: "singleChoice",
          label: "Is this version final?",
          required: true,
          briefLabel: "Is the track final",
          choices: [
            { value: "Final and mastered", label: "Final and mastered" },
            { value: "Still being mixed", label: "Still being mixed or mastered" },
            { value: "Not finished recording", label: "Not finished recording yet" },
          ],
        },
      ],
    },
    {
      key: "length",
      title: "Length",
      intro: "This is the single biggest thing that sets the cost and the timeline.",
      fields: [
        {
          key: "duration",
          kind: "shortText",
          label: "How long is the song?",
          placeholder: "3:24",
          width: "half",
          briefLabel: "Song length",
        },
        {
          key: "coverage",
          kind: "singleChoice",
          label: "Full song, or a section?",
          choices: [
            { value: "Full song", label: "The full song" },
            { value: "A section", label: "A section of it" },
            { value: "Not sure yet", label: "Not sure yet — advise me" },
          ],
        },
        {
          key: "coverageWhich",
          kind: "shortText",
          label: "If a section, which part, and how long?",
          placeholder: "Hook only, about 45 seconds",
          briefLabel: "Which section",
        },
      ],
    },
    {
      key: "your-vision",
      title: "Your vision",
      intro: "However it comes out. Messy is fine — we will shape it with you.",
      fields: [
        {
          key: "vision",
          kind: "longText",
          label: "What do you picture when you listen to this song?",
          placeholder:
            "A place, a story, a colour, a moment, a feeling. As much detail as you like.",
          briefLabel: "Their vision",
        },
        {
          key: "threeWords",
          kind: "shortText",
          label: "Three words that should describe the finished video",
          help: "We check the final cut against these three words.",
          placeholder: "Emotional, cinematic, powerful",
          briefLabel: "Three words",
        },
      ],
    },
    {
      key: "references",
      title: "References",
      intro: "The fastest way to show us what you mean.",
      fields: [
        {
          key: "refs",
          kind: "longText",
          label:
            "Share two to five music videos, film scenes or images — and say what you like about each one",
          help: '"I like this video" tells us little. "I like how the camera never cuts away from her" tells us a lot.',
          placeholder:
            "Paste the links, and after each one write what caught you: the lighting, how fast it cuts, the colours, the world, the camera.",
          briefLabel: "References",
        },
      ],
    },
    {
      key: "creative-style",
      title: "Creative style",
      intro: "Pick as many as appeal to you.",
      fields: [
        {
          key: "style",
          kind: "multiChoice",
          label: "Visual direction",
          briefLabel: "Creative style",
          choices: [
            { value: "Cinematic and realistic", label: "Cinematic and realistic" },
            { value: "Luxury and glamorous", label: "Luxury and glamorous" },
            { value: "Afrocentric and cultural", label: "Afrocentric and cultural" },
            { value: "Romantic and emotional", label: "Romantic and emotional" },
            { value: "Dark and mysterious", label: "Dark and mysterious" },
            { value: "Fantasy and surreal", label: "Fantasy and surreal" },
            { value: "Futuristic", label: "Futuristic" },
            { value: "Animated or illustrated", label: "Animated or illustrated" },
          ],
        },
        {
          key: "styleOther",
          kind: "shortText",
          label: "Something else",
          briefLabel: "Other style",
        },
      ],
    },
    {
      key: "you-in-the-video",
      title: "You in the video",
      intro: "This choice shapes the whole production, so take a moment on it.",
      note: "If anyone other than the artist appears as themselves, we need their written permission before we start. We will ask you for it.",
      fields: [
        {
          key: "appearance",
          kind: "singleChoice",
          label: "How should the artist appear?",
          required: true,
          briefLabel: "How the artist appears",
          choices: [
            { value: "As myself, realistic", label: "As myself — a realistic AI version of me" },
            { value: "As myself, stylised", label: "As myself — a stylised version of me" },
            { value: "An AI character", label: "An AI character that represents me, not my face" },
            { value: "No people", label: "No people at all — visuals only" },
          ],
        },
        {
          key: "photosLink",
          kind: "url",
          label: "If you appear: link to your photos",
          help: "Five to ten recent photos. Face clearly visible, good light, a few different angles. The better the photos, the more the video looks like you.",
          placeholder: "A Drive or Dropbox folder",
          briefLabel: "Photos",
        },
      ],
    },
    {
      key: "story-or-performance",
      title: "Story or performance",
      intro: "How the video carries the song.",
      fields: [
        {
          key: "structure",
          kind: "singleChoice",
          label: "What should the video be built around?",
          briefLabel: "Story or performance",
          choices: [
            { value: "A storyline", label: "A storyline, with a beginning and an end" },
            { value: "Performance", label: "Performance — the artist delivering the song" },
            { value: "A mix of both", label: "A mix of both" },
            { value: "Pure visuals", label: "Pure visuals, no plot" },
          ],
        },
      ],
    },
    {
      key: "scenes-and-world",
      title: "Scenes and world",
      intro: "Where it happens and what is in it.",
      fields: [
        {
          key: "scenes",
          kind: "longText",
          label: "Any settings, outfits, props or effects you definitely want",
          placeholder:
            "A Lagos street at night, a desert, water, a particular outfit, a car, a logo, dancers.",
          briefLabel: "Scenes and world",
        },
      ],
    },
    {
      key: "please-do-not-include",
      title: "Please do not include",
      intro: "The question that saves the most changes later.",
      fields: [
        {
          key: "avoid",
          kind: "longText",
          label: "Anything you never want to see in this video",
          placeholder:
            "Colours, imagery, themes, clothing, anything that does not sit right with you or your audience.",
          briefLabel: "Do not include",
        },
      ],
    },
    {
      key: "delivery",
      title: "Delivery",
      intro: "Where it goes, and when you need it.",
      note: "Tell us now if you need both shapes. It changes how every shot is framed.",
      fields: [
        {
          key: "platform",
          kind: "multiChoice",
          label: "Where will the video be used?",
          briefLabel: "Platforms",
          choices: [
            { value: "YouTube", label: "YouTube" },
            { value: "Instagram", label: "Instagram" },
            { value: "TikTok", label: "TikTok" },
            { value: "X", label: "X" },
            { value: "Facebook", label: "Facebook" },
            { value: "TV or screens", label: "TV or screens" },
          ],
        },
        {
          key: "ratio",
          kind: "singleChoice",
          label: "What shape should it be?",
          briefLabel: "Shape",
          choices: [
            { value: "Wide (16:9)", label: "Wide, for YouTube and TV" },
            { value: "Tall (9:16)", label: "Tall, for TikTok, Reels and Shorts" },
            { value: "Both", label: "Both" },
            { value: "Not sure", label: "Not sure — advise me" },
          ],
        },
        {
          key: "deliverable",
          kind: "singleChoice",
          label: "What do you need?",
          briefLabel: "What they need",
          choices: [
            { value: "Full music video", label: "The full music video" },
            { value: "Short promo clips", label: "Short promo clips only" },
            { value: "Both", label: "Both" },
          ],
        },
        {
          key: "budget",
          kind: "shortText",
          label: "Budget range",
          placeholder: "₦",
          width: "half",
          briefLabel: "Budget",
        },
        {
          key: "deadline",
          kind: "shortText",
          label: "When do you need it?",
          placeholder: "A date, or a release week",
          width: "half",
          briefLabel: "Deadline",
        },
      ],
    },
    {
      key: "anything-else",
      title: "Anything else",
      intro: "Anything we have not asked that we should know.",
      fields: [
        {
          key: "anythingElse",
          kind: "longText",
          label: "Over to you",
          briefLabel: "Anything else",
        },
      ],
    },
  ],
  closing: {
    title: "Your brief is with us",
    body: [
      "We have everything you wrote. The team is reading it now and will come back to you with a concept.",
      "If you have not sent us the song file or your photos yet, send them over on WhatsApp or by email.",
    ],
    whatsapp: "+44 7538 598770",
    email: "info@futureuni.org",
  },
};
