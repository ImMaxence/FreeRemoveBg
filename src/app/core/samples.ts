/**
 * Sample pictures offered to try the tool without a file of one's own. They are served by the
 * site (public/samples); their authors and licenses are listed in public/samples/CREDITS.md.
 */
export interface Sample {
  id: string;
  /** The picture itself, cut out live like any other. */
  url: string;
  thumb: string;
  name: string;
}

export const SAMPLES: Sample[] = ['dog', 'cat', 'plant'].map((id) => ({
  id,
  url: `/samples/${id}.jpg`,
  thumb: `/samples/${id}-thumb.jpg`,
  name: `${id}.jpg`,
}));
