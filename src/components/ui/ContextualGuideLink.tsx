import { CircleHelp } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { bibleArticleForPath } from '../../features/knowledge/bible/bibleContent'

export function ContextualGuideLink(){
 const location=useLocation(),articleId=bibleArticleForPath(location.pathname),from=`${location.pathname}${location.search}`
 return <Link className="button ghost contextual-guide" to={`/knowledge/bible/${articleId}?from=${encodeURIComponent(from)}`} aria-label="How this section works"><CircleHelp size={15}/>Guide</Link>
}
