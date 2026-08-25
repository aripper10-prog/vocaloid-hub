export type Platform = 'youtube' | 'niconico';
export type VocalType = 'vocaloid' | 'human' | 'collab';
export type CreatorRole = 'music' | 'lyrics' | 'tuning' | 'singer' | 'mix' | 'illust' | 'movie';
export type RelationType = 'cover' | 'remix' | 'pv_remake' | 'dance' | 'other';

export interface Creator {
  id: string;
  name: string;
  role: CreatorRole;
}

export interface SongCredit {
  role: CreatorRole;
  creators: Creator;
}

export interface SongRelation {
  id: string;
  parent_song_id: string;
  child_song_id: string;
  relation_type: RelationType;
  parent_song?: Song;
  child_song?: Song;
}

export interface Song {
  id: string;
  title: string;
  platform: Platform;
  video_id: string;
  thumbnail_url: string;
  bpm: number | null;
  piapro_url?: string;
  vocal_type: VocalType;
  is_event_collab: boolean;
  published_at: string;
  created_at: string;
  song_credits?: SongCredit[];
  parent_relations?: SongRelation[];
  child_relations?: SongRelation[];
}