/**
 * The bar at the top of the Library and Reference tabs: a menu of the tab's
 * topics (or all of them at once) and a search box beside it, and what's said
 * when a search finds things in other topics than the one shown.
 */
import { Fragment } from 'react'
import { ALL_TOPICS, type TopicChoice, type TopicGroup } from '../useShownTopic.ts'

/** The topic menu and the search box. */
export function TopicBar({ groups, shown, onShow, query, onQuery, placeholder, searchLabel }: {
  groups: readonly TopicGroup[]
  shown: string
  onShow: (id: string) => void
  query: string
  onQuery: (query: string) => void
  /** The search box's hint, when every topic is shown (with one, it's "Search this topic…"). */
  placeholder: string
  /** What the search box is, for screen readers. */
  searchLabel: string
}) {
  const options = (topics: readonly TopicChoice[]) =>
    topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)
  return (
    <div className="ref__nav topic-bar">
      <select className="topic-bar__menu" value={shown} aria-label="Topic" onChange={(e) => onShow(e.target.value)}>
        <option value={ALL_TOPICS}>All topics</option>
        {groups.map((g, i) => g.label
          ? <optgroup key={g.label} label={g.label}>{options(g.topics)}</optgroup>
          : <Fragment key={i}>{options(g.topics)}</Fragment>)}
      </select>
      <input
        className="topic-bar__search"
        type="search"
        value={query}
        placeholder={shown === ALL_TOPICS ? placeholder : 'Search this topic…'}
        aria-label={searchLabel}
        onChange={(e) => onQuery(e.target.value)}
      />
    </div>
  )
}

/**
 * Under a search's results: if it found nothing in the topic shown, says so;
 * if it found things in other topics, offers to show every topic.
 */
export function OtherMatches({ query, foundHere, elsewhere, onShowAll }: {
  query: string
  /** Whether anything is shown. */
  foundHere: boolean
  /** How many matches there are in the topics not shown. */
  elsewhere: number
  onShowAll: () => void
}) {
  const more = elsewhere > 0 && (
    <button className="source__button" onClick={onShowAll}>
      {foundHere
        ? `${elsewhere} more ${elsewhere === 1 ? 'match' : 'matches'} in other topics`
        : `Show the ${elsewhere === 1 ? 'match' : `${elsewhere} matches`} in all topics`}
    </button>
  )
  if (foundHere) return more ? <p className="topic-bar__elsewhere">{more}</p> : null
  return <p className="doc__empty">Nothing here matches “{query}”. {more}</p>
}
