import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'

interface WorkspaceData {
  workspace_id: string
  name: string
  github_repository: string
  createdAt: string
  analysis?: {
    id: string
    status: string
    progress?: number
    message?: string
    current_step?: string
    startedAt?: string
    completedAt?: string
    hasResult?: boolean
    result?: any
  }
}

export default function WorkspacePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { id } = router.query
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedContributor, setSelectedContributor] = useState<any | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/')
    }
  }, [status, router])

  useEffect(() => {
    if (!id || Array.isArray(id)) return
    const fetchWorkspace = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/workspaces/${id}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error || 'Failed to load workspace')
        } else {
          setWorkspace(data.workspace)

          // If analysis is not completed, start polling status
          // Start polling status if analysis isn't completed yet (we may not have analysis stored yet)
          if (!data.workspace.analysis || (data.workspace.analysis && !data.workspace.analysis.hasResult)) {
            pollStatus()
          }
        }
      } catch (err) {
        console.error(err)
        setError('Failed to load workspace')
      } finally {
        setLoading(false)
      }
    }

    fetchWorkspace()
  }, [id])
  // Poll status function with interval ref and proper cleanup
  const pollingRef = useRef<number | null>(null)

  const pollStatus = async () => {
    if (pollingRef.current) return // already polling
    setError('')
    setLoading(true)

    pollingRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/workspaces/${id}/status`)
        const data = await res.json()
        if (!res.ok) {
          console.error('status fetch error', data)
          setError(data?.error || 'Failed to fetch status')
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          setLoading(false)
          return
        }

        const analysis = data.analysis
        if (analysis) {
          // update workspace local state with analysis summary (including result if present)
          setWorkspace((prev) => {
            if (!prev) return prev
            return { ...prev, analysis: { ...analysis } }
          })
        }

        // Stop polling when analyzer reports completed OR when a result is provided
        if (data.status === 'completed' || (analysis && analysis.result)) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }
          // if analysis contains result, we've already set it on workspace; otherwise fetch final workspace once
          if (!(analysis && analysis.result)) {
            try {
              const finalRes = await fetch(`/api/workspaces/${id}`)
              const finalData = await finalRes.json()
              if (finalRes.ok) setWorkspace(finalData.workspace)
            } catch (e) {
              console.error('failed to fetch final workspace', e)
            }
          }
          setLoading(false)
        }
      } catch (err) {
        console.error('poll error', err)
        setError('Polling failed')
        setLoading(false)
        if (pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    }, 2000)
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading workspace...</p>
        </div>
      </div>
    )
  }

  const result = workspace?.analysis?.result

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <header className="bg-white shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{workspace?.name}</h1>
              <p className="text-sm text-gray-500 mt-1">Created {new Date(workspace?.createdAt || '').toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full">{session?.user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded">
            {error}
          </div>
        )}

        {!workspace ? (
          <div className="text-center text-gray-600 py-12">No workspace found.</div>
        ) : (
          <div className="space-y-8">
            {/* Workspace Info Card */}
            <div className="bg-white rounded-xl shadow-md p-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Repository</h2>
              <a
                href={workspace.github_repository}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-700 break-all font-mono text-sm mb-4 block"
              >
                {workspace.github_repository}
              </a>
              <a
                href={workspace.github_repository}
                target="_blank"
                rel="noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Open on GitHub →
              </a>
            </div>

            {/* Analysis Status */}
            {workspace.analysis && (
              <div className="bg-white rounded-xl shadow-md p-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis Status</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      workspace.analysis.status === 'completed'
                        ? 'bg-green-50 text-green-700'
                        : workspace.analysis.status === 'processing'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-50 text-gray-700'
                    }`}>
                      {workspace.analysis.status.toUpperCase()}
                    </span>
                  </div>

                  {typeof workspace.analysis.progress === 'number' && (
                    <div>
                      <div className="flex justify-between mb-2 text-sm">
                        <span className="text-gray-600">Progress</span>
                        <span className="font-medium text-gray-900">{workspace.analysis.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          style={{ width: `${workspace.analysis.progress}%` }}
                          className="bg-blue-600 h-2 transition-all duration-300"
                        />
                      </div>
                    </div>
                  )}

                  {workspace.analysis.message && (
                    <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                      {workspace.analysis.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Analysis Result - Summary Cards */}
            {result ? (
              <div className="space-y-8">
                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{result.codebase_health?.total_files || 0}</div>
                    <div className="text-sm text-gray-600">Total Files</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{result.codebase_health?.total_commits || 0}</div>
                    <div className="text-sm text-gray-600">Total Commits</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{result.codebase_health?.active_contributors || 0}</div>
                    <div className="text-sm text-gray-600">Contributors</div>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{result.codebase_health?.bus_factor || '—'}</div>
                    <div className="text-sm text-gray-600">Bus Factor</div>
                  </div>
                </div>

                {/* Project Summary */}
                {result.project_summary && (
                  <div className="bg-white rounded-xl shadow-md p-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Project Overview</h2>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{result.project_summary}</p>
                  </div>
                )}

                {/* Languages */}
                {result.primary_languages && result.primary_languages.length > 0 && (
                  <div className="bg-white rounded-xl shadow-md p-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Primary Languages</h2>
                    <div className="flex flex-wrap gap-2">
                      {result.primary_languages.map((lang: string) => (
                        <span key={lang} className="px-4 py-2 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 rounded-full font-medium">
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contributors Grid - Clickable Cards */}
                {result.contributors && result.contributors.length > 0 && (
                  <div className="bg-white rounded-xl shadow-md p-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-6">Contributors</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {result.contributors.map((contributor: any) => (
                        <div
                          key={contributor.username}
                          onClick={() => setSelectedContributor(contributor)}
                          className="border border-gray-200 rounded-lg p-4 hover:shadow-lg hover:border-blue-400 cursor-pointer transition-all bg-gradient-to-br from-white to-gray-50"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-bold text-gray-900">{contributor.username}</h3>
                              <p className="text-xs text-gray-500">{contributor.email}</p>
                            </div>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Commits:</span>
                              <span className="font-semibold text-gray-900">{contributor.total_commits}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Files:</span>
                              <span className="font-semibold text-gray-900">{contributor.files_contributed?.length || 0}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Expertise:</span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                contributor.expertise_level === 'expert'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : contributor.expertise_level === 'advanced'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {contributor.expertise_level || 'unknown'}
                              </span>
                            </div>
                            {contributor.bus_factor_risk && (
                              <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                                <span className="text-gray-600">Risk:</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  contributor.bus_factor_risk === 'high'
                                    ? 'bg-red-100 text-red-800'
                                    : contributor.bus_factor_risk === 'medium'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {contributor.bus_factor_risk}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="mt-3 text-xs text-blue-600 font-medium">Click for details →</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Codebase Health & Recommendations */}
                <div className="grid md:grid-cols-2 gap-8">
                  {result.codebase_health && (
                    <div className="bg-white rounded-xl shadow-md p-8">
                      <h2 className="text-lg font-semibold text-gray-900 mb-6">Codebase Health</h2>
                      <div className="space-y-4">
                        {result.codebase_health.hot_spots && result.codebase_health.hot_spots.length > 0 && (
                          <div>
                            <h3 className="font-medium text-gray-900 mb-2">Hot Spots</h3>
                            <ul className="space-y-1 text-sm text-gray-700">
                              {result.codebase_health.hot_spots.slice(0, 5).map((spot: string, i: number) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-orange-500 mt-0.5">●</span>
                                  <span className="truncate">{spot}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {result.recommendations && result.recommendations.length > 0 && (
                    <div className="bg-white rounded-xl shadow-md p-8">
                      <h2 className="text-lg font-semibold text-gray-900 mb-6">Recommendations</h2>
                      <ul className="space-y-3">
                        {result.recommendations.slice(0, 5).map((rec: string, i: number) => (
                          <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                            <span className="text-blue-600 font-bold mt-0.5">✓</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-600">
                Analysis is in progress. Results will appear here shortly.
              </div>
            )}
          </div>
        )}
      </main>

      {/* Contributor Detail Modal */}
      {selectedContributor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 flex items-center justify-between border-b">
              <div>
                <h2 className="text-2xl font-bold">{selectedContributor.username}</h2>
                <p className="text-blue-100 text-sm mt-1">{selectedContributor.email}</p>
              </div>
              <button
                onClick={() => setSelectedContributor(null)}
                className="text-white hover:bg-blue-500 rounded-full p-2 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-8 space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{selectedContributor.total_commits}</div>
                  <div className="text-sm text-gray-600">Total Commits</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">{selectedContributor.lines_added || 0}</div>
                  <div className="text-sm text-gray-600">Lines Added</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-600">{selectedContributor.lines_deleted || 0}</div>
                  <div className="text-sm text-gray-600">Lines Deleted</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">{selectedContributor.active_days || 0}</div>
                  <div className="text-sm text-gray-600">Active Days</div>
                </div>
              </div>

              {/* Expertise Level & Risk */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Expertise Level</h3>
                  <span className={`inline-block px-3 py-1 rounded-full font-medium text-sm ${
                    selectedContributor.expertise_level === 'expert'
                      ? 'bg-yellow-100 text-yellow-800'
                      : selectedContributor.expertise_level === 'advanced'
                      ? 'bg-blue-100 text-blue-800'
                      : selectedContributor.expertise_level === 'intermediate'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {(selectedContributor.expertise_level || 'Unknown').charAt(0).toUpperCase() + (selectedContributor.expertise_level || 'Unknown').slice(1)}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Bus Factor Risk</h3>
                  <span className={`inline-block px-3 py-1 rounded-full font-medium text-sm ${
                    selectedContributor.bus_factor_risk === 'high'
                      ? 'bg-red-100 text-red-800'
                      : selectedContributor.bus_factor_risk === 'medium'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {(selectedContributor.bus_factor_risk || 'Unknown').charAt(0).toUpperCase() + (selectedContributor.bus_factor_risk || 'Unknown').slice(1)}
                  </span>
                </div>
              </div>

              {/* Activity Timeline */}
              {(selectedContributor.first_commit_date || selectedContributor.last_commit_date) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Activity Timeline</h3>
                  <div className="space-y-2 text-sm">
                    {selectedContributor.first_commit_date && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">First Commit:</span>
                        <span className="font-medium text-gray-900">{new Date(selectedContributor.first_commit_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {selectedContributor.last_commit_date && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Last Commit:</span>
                        <span className="font-medium text-gray-900">{new Date(selectedContributor.last_commit_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {selectedContributor.commit_frequency && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Commit Frequency:</span>
                        <span className="font-medium text-gray-900">{selectedContributor.commit_frequency}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Knowledge Areas */}
              {selectedContributor.knowledge_areas && selectedContributor.knowledge_areas.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Knowledge Areas</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedContributor.knowledge_areas.map((area: string) => (
                      <span key={area} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contribution Summary */}
              {selectedContributor.contribution_summary && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Contribution Summary</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">{selectedContributor.contribution_summary}</p>
                </div>
              )}

              {/* Files Contributed */}
              {selectedContributor.files_contributed && selectedContributor.files_contributed.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Top Files Contributed To</h3>
                  <div className="bg-gray-50 rounded-lg divide-y max-h-64 overflow-y-auto">
                    {selectedContributor.files_contributed.slice(0, 10).map((file: any, i: number) => (
                      <div key={i} className="p-3 text-sm">
                        <div className="font-mono text-gray-900 truncate">{file.file_path}</div>
                        <div className="flex justify-between text-xs text-gray-600 mt-1">
                          <span>{file.lines_contributed || 0} lines</span>
                          <span>{(file.ownership_percentage || 0).toFixed(1)}% ownership</span>
                        </div>
                        {file.last_modified && (
                          <div className="text-xs text-gray-500 mt-1">
                            Last: {new Date(file.last_modified).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedContributor.files_contributed.length > 10 && (
                    <div className="text-center text-xs text-gray-500 py-2">
                      +{selectedContributor.files_contributed.length - 10} more files
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
