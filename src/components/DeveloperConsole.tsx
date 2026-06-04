import React, { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, Play, Code, AlertTriangle, Terminal, Info } from 'lucide-react';
import { Api } from '../utils/api.js';
import { ApiKey } from '../types.js';

export default function DeveloperConsole() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Playground state
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [endpoint, setEndpoint] = useState<'LIST' | 'SINGLE' | 'UPLOAD'>('LIST');
  const [testFileId, setTestFileId] = useState('');
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [playgroundOutput, setPlaygroundOutput] = useState<any>(null);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await Api.getDeveloperKeys();
      if (res.success) {
        setKeys(res.data || []);
        if (res.data && res.data.length > 0 && !selectedKey) {
          setSelectedKey(res.data[0].secretKey);
        }
      } else {
        setError(res.error || 'Failed to list developer keys.');
      }
    } catch (err) {
      setError('Connection failure loading developer console.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await Api.createDeveloperKey(newKeyName.trim());
      if (res.success) {
        setNewKeyName('');
        setSuccessMessage('Dev token generated. Keep it secret!');
        await fetchKeys();
        if (res.data) {
          // Auto reveal the new key
          setRevealedKeys(prev => ({ ...prev, [res.data.id]: true }));
          setSelectedKey(res.data.secretKey);
        }
      } else {
        setError(res.error || 'Could not instantiate API Key.');
      }
    } catch (err) {
      setError('Communication exception.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (id: string, secretKey: string) => {
    if (!confirm('Are you absolutely sure you want to permanently revoke this access token? Live external integration routes using this credential will crash immediately.')) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await Api.deleteDeveloperKey(id);
      if (res.success) {
        setSuccessMessage('API key revoked.');
        await fetchKeys();
        if (selectedKey === secretKey) {
          setSelectedKey('');
        }
      } else {
        setError(res.error || 'Could not revoke API Key.');
      }
    } catch (err) {
      setError('Failed to contact revoking service.');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Build raw sample endpoints definitions
  const activeKeySample = selectedKey || 'vault_live_********************************';
  const appOrigin = window.location.origin;

  const curlSamples = {
    LIST: `curl -X GET "${appOrigin}/api/external/files" \\\n  -H "x-api-key: ${activeKeySample}"`,
    SINGLE: `curl -X GET "${appOrigin}/api/external/files/${testFileId || 'file_abc123'}" \\\n  -H "x-api-key: ${activeKeySample}"`,
    UPLOAD: `curl -X POST "${appOrigin}/api/external/files" \\\n  -H "x-api-key: ${activeKeySample}" \\\n  -F "file=@/path/to/your/document.pdf"`
  };

  const runPlaygroundTest = async () => {
    if (!selectedKey) {
      alert('Please generate and select an API Key first.');
      return;
    }
    setPlaygroundLoading(true);
    setPlaygroundOutput(null);

    try {
      let url = '/api/external/files';
      let options: RequestInit = {
        method: 'GET',
        headers: {
          'x-api-key': selectedKey
        }
      };

      if (endpoint === 'SINGLE') {
        const targetId = testFileId.trim() || 'dummy';
        url = `/api/external/files/${targetId}`;
      } else if (endpoint === 'UPLOAD') {
        // Create dummy small file to upload interactively
        const content = 'Programmatic API test file output created at ' + new Date().toISOString();
        const blob = new Blob([content], { type: 'text/plain' });
        const dummyFile = new File([blob], 'api_sandbox_doc.txt', { type: 'text/plain' });
        const fd = new FormData();
        fd.append('file', dummyFile);
        
        options = {
          method: 'POST',
          headers: {
            'x-api-key': selectedKey
          },
          body: fd
        };
      }

      const res = await fetch(url, options);
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : await res.text();
      setPlaygroundOutput({
        status: res.status,
        statusText: res.statusText,
        data: data
      });
    } catch (err: any) {
      setPlaygroundOutput({
        error: err.message || 'Network sandbox request failed.'
      });
    } finally {
      setPlaygroundLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6 min-h-screen">
      {/* Header */}
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-200">
          <div>
            <h1 className="font-sans font-bold text-2xl tracking-tight text-slate-900 flex items-center gap-2">
              <Terminal className="w-6 h-6 text-blue-600" />
              Programmatic API Platform
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Connect external services, configure webhooks, or upload payloads via HTTPS securely.
            </p>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Grid Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* API Key Manager Card */}
          <div className="lg:col-span-1 bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
            <div>
              <h2 className="text-md font-semibold text-slate-900 flex items-center gap-1.5">
                <Key className="w-4 h-4 text-slate-500" />
                Active Credentials
              </h2>
              <p className="text-xs text-slate-500">Provide direct authentication keys below.</p>
            </div>

            {/* Create form */}
            <form onSubmit={handleCreateKey} className="flex gap-2">
              <input
                id="input-new-key-name"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="Key label (e.g. Backups)"
                disabled={loading}
                className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !newKeyName.trim()}
                className="bg-blue-600 group hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </form>

            <div className="border-t border-gray-100 pt-3 space-y-3 max-h-[300px] overflow-y-auto">
              {loading && keys.length === 0 ? (
                <div className="text-center py-4 text-xs text-slate-400">Loading credentials...</div>
              ) : keys.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-mono">No keys initialized. Specify labels above.</div>
              ) : (
                keys.map(key => {
                  const isRevealed = revealedKeys[key.id] || false;
                  return (
                    <div key={key.id} className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-all ${selectedKey === key.secretKey ? 'border-blue-500 bg-blue-50/20' : 'border-gray-200 bg-white'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 truncate" title={key.name}>{key.name}</span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 bg-slate-50 border border-gray-200 rounded p-1.5 font-mono text-[10px] relative">
                        <span className="flex-1 text-slate-600 truncate pr-6 select-all">
                          {isRevealed ? key.secretKey : `${key.secretKey.substring(0, 11)}************************`}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleReveal(key.id)}
                            className="p-1 hover:bg-gray-200 rounded text-slate-500 cursor-pointer"
                          >
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(key.secretKey, key.id)}
                            className="p-1 hover:bg-gray-200 rounded text-slate-500 cursor-pointer"
                          >
                            {copiedKeyId === key.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key.secretKey)}
                          className={`text-[10px] font-medium cursor-pointer ${selectedKey === key.secretKey ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                          {selectedKey === key.secretKey ? '● Selected for testing' : 'Select for live test'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeKey(key.id, key.secretKey)}
                          className="hover:text-red-500 text-slate-400 cursor-pointer p-0.5"
                          title="Revoke access"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Interactive Documentation Panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900 text-slate-200 rounded-xl shadow-lg border border-slate-800 p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-sans font-bold text-slate-100 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                  REST API Endpoint Documentation
                </h3>
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-900/60 px-2 py-0.5 rounded uppercase">
                  Service Active
                </span>
              </div>

              {/* Endpoint Selection Nav */}
              <div className="flex border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setEndpoint('LIST')}
                  className={`px-4 py-2 text-xs font-mono border-b-2 transition-all cursor-pointer ${endpoint === 'LIST' ? 'border-emerald-400 text-emerald-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                  GET /api/external/files
                </button>
                <button
                  type="button"
                  onClick={() => setEndpoint('SINGLE')}
                  className={`px-4 py-2 text-xs font-mono border-b-2 transition-all cursor-pointer ${endpoint === 'SINGLE' ? 'border-emerald-400 text-emerald-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                  GET /api/external/files/:id
                </button>
                <button
                  type="button"
                  onClick={() => setEndpoint('UPLOAD')}
                  className={`px-4 py-2 text-xs font-mono border-b-2 transition-all cursor-pointer ${endpoint === 'UPLOAD' ? 'border-emerald-400 text-emerald-400 bg-slate-850' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                  POST /api/external/files
                </button>
              </div>

              {/* Description & curl */}
              <div className="space-y-4">
                <div className="text-xs text-slate-350 bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-start gap-2">
                  <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    {endpoint === 'LIST' && (
                      <p>Retrieve full structured index mappings of your stored files securely. Includes size, links, and Gemini intelligence tags.</p>
                    )}
                    {endpoint === 'SINGLE' && (
                      <div className="space-y-2">
                        <p>Retrieve single record metadata file properties by ID.</p>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] font-mono text-slate-450">ID param:</span>
                          <input
                            type="text"
                            value={testFileId}
                            onChange={e => setTestFileId(e.target.value)}
                            placeholder="e.g. file_abc123"
                            className="bg-slate-900 border border-slate-750 text-emerald-400 px-2 py-0.5 rounded text-[10px] w-40 font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                    {endpoint === 'UPLOAD' && (
                      <p>Stream physical storage payload objects straight into your encrypted PrivateVault programmatically. Safe Multi-part form-data binary upload.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-500 tracking-wider uppercase font-mono font-bold block">Terminal cURL command:</span>
                  <div className="relative group/sample">
                    <pre className="bg-slate-950 border border-slate-850 p-4 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre">
                      {curlSamples[endpoint]}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(curlSamples[endpoint], 'curl_' + endpoint)}
                      className="absolute right-3 top-3 p-1.5 bg-slate-900 text-slate-400 border border-slate-850 hover:bg-slate-800 hover:text-white rounded cursor-pointer transition-colors"
                      title="Copy curl"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Active API Sandbox Sandbox Panel */}
              <div className="border-t border-slate-800 pt-5 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">Interactive Token Sandbox</h4>
                    <p className="text-[11px] text-slate-500">Test actual system integrations live inside this browser sandboxed playground.</p>
                  </div>
                  <button
                    type="button"
                    onClick={runPlaygroundTest}
                    disabled={playgroundLoading || !selectedKey}
                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-4 py-2 rounded-lg text-xs font-semibold tracking-tight transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {playgroundLoading ? (
                      <span className="w-3.5 h-3.5 inline-block border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-slate-950" />
                    )}
                    <span>Execute Sandbox HTTP</span>
                  </button>
                </div>

                {!selectedKey && (
                  <div className="bg-amber-950/20 border border-amber-900/40 text-amber-300 p-3 rounded-lg text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Please create and select a live active API key on the left to activate the Sandbox playground.</span>
                  </div>
                )}

                {playgroundOutput && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <div className="flex items-center gap-2 text-xs font-mono justify-between">
                      <span className="text-slate-500 uppercase tracking-widest text-[10px]">Server Answer Response:</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${playgroundOutput.status < 300 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50' : 'bg-red-950/80 text-red-400 border border-red-900/50'}`}>
                          HTTP {playgroundOutput.status} {playgroundOutput.statusText}
                        </span>
                      </div>
                    </div>
                    <pre className="bg-slate-950 border border-slate-850 p-4 rounded-lg text-[10.5px] font-mono text-emerald-400 overflow-x-auto max-h-[300px] whitespace-pre-wrap">
                      {JSON.stringify(playgroundOutput.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
