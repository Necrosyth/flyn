import React, { useState, useEffect } from 'react';
import { Phone, Loader2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authedFetch } from '@/services/authApi';
import { API_BASE_URL } from '@/lib/api';

interface Candidate {
    id: string;
    source: string;
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
    role?: string;
    data: unknown;
}

interface VapiWebCallerProps {
    nodeOutputs: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function getString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export const VapiWebCaller: React.FC<VapiWebCallerProps> = ({ nodeOutputs }) => {
    const { toast } = useToast();
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [callingId, setCallingId] = useState<string | null>(null);

    // Extract candidates from workflow node outputs
    useEffect(() => {
        if (!nodeOutputs) return;
        const extracted: Candidate[] = [];

        Object.entries(nodeOutputs).forEach(([nodeId, output]) => {
            const outputObj = isRecord(output) ? output : {};

            const employee = isRecord(outputObj.employee) ? outputObj.employee : null;
            if (employee) {
                extracted.push({
                    id: `${nodeId}_${typeof employee._id === 'string' ? employee._id : Date.now()}`,
                    source: 'HR Module',
                    name: getString(employee.name),
                    email: getString(employee.email),
                    phone: getString(employee.phone),
                    notes: getString(employee.notes),
                    role: getString(employee.position) || getString(employee.department),
                    data: employee,
                });
            }

            const member = isRecord(outputObj.member) ? outputObj.member : null;
            if (member) {
                extracted.push({
                    id: `${nodeId}_${typeof member._id === 'string' ? member._id : Date.now()}`,
                    source: 'Church Module',
                    name: getString(member.name),
                    email: getString(member.email),
                    phone: getString(member.phone),
                    notes: getString(member.notes),
                    role: getString(member.membership_type),
                    data: member,
                });
            }

            const client = isRecord(outputObj.client) ? outputObj.client : null;
            if (client) {
                extracted.push({
                    id: `${nodeId}_${typeof client._id === 'string' ? client._id : Date.now()}`,
                    source: 'Coaches Module',
                    name: getString(client.name),
                    email: getString(client.email),
                    phone: getString(client.phone),
                    notes: getString(client.notes),
                    role: getString(client.goal) || getString(client.program),
                    data: client,
                });
            }

            const project = isRecord(outputObj.project) ? outputObj.project : null;
            if (project) {
                extracted.push({
                    id: `${nodeId}_${typeof project._id === 'string' ? project._id : Date.now()}`,
                    source: 'Freelancer Module',
                    name: getString(project.client_name),
                    email: getString(project.client_email),
                    phone: getString(project.client_phone),
                    notes: getString(project.notes),
                    role: getString(project.project_type),
                    data: project,
                });
            }

            const contact = isRecord(outputObj.contact) ? outputObj.contact : null;
            if (contact && contact.name) {
                extracted.push({
                    id: `${nodeId}_${typeof contact._id === 'string' ? contact._id : Date.now()}`,
                    source: 'CRM',
                    name: getString(contact.name),
                    email: getString(contact.email),
                    phone: getString(contact.phone),
                    notes: getString(contact.notes),
                    role: 'Contact',
                    data: contact,
                });
            }
        });

        setCandidates(extracted);
    }, [nodeOutputs]);

    const placeCall = async (candidate: Candidate) => {
        if (!candidate.phone) {
            toast({ variant: 'destructive', title: 'No phone number', description: `${candidate.name || 'This contact'} has no phone number on file.` });
            return;
        }

        setCallingId(candidate.id);
        try {
            const res = await authedFetch(`${API_BASE_URL}/channels/twilio/ai-call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: candidate.phone }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || (isRecord(data) && data.success === false)) {
                const msg = isRecord(data) && typeof data.message === 'string' ? data.message
                    : isRecord(data) && typeof data.error === 'string' ? data.error
                    : 'Call failed';
                toast({ variant: 'destructive', title: 'Call failed', description: msg });
                return;
            }

            toast({ title: 'Call initiated', description: `Twilio is dialing ${candidate.name || candidate.phone}.` });
        } catch (err: unknown) {
            const msg = isRecord(err) && typeof err.message === 'string' ? err.message : 'Network error';
            toast({ variant: 'destructive', title: 'Call failed', description: msg });
        } finally {
            setCallingId(null);
        }
    };

    if (candidates.length === 0) return null;

    return (
        <Card className="mt-8 border-purple-500/30 bg-purple-500/5 overflow-hidden">
            <CardHeader className="pb-3 border-b border-purple-500/20 bg-purple-500/10">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Phone className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                        <CardTitle className="text-lg text-purple-100">Call Hub</CardTitle>
                        <CardDescription className="text-purple-300/70">
                            Found {candidates.length} {candidates.length === 1 ? 'person' : 'people'} in the workflow context. Initiate an AI call via Twilio.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {candidates.map(candidate => (
                        <div
                            key={candidate.id}
                            className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 p-4 transition-all"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-semibold border border-zinc-700">
                                        {candidate.name ? candidate.name.substring(0, 2).toUpperCase() : <User className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-sm text-zinc-100 truncate max-w-[120px]" title={candidate.name}>
                                            {candidate.name || 'Unknown'}
                                        </h4>
                                        <p className="text-xs text-zinc-500">{candidate.role || 'No Role'}</p>
                                    </div>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 px-1.5 py-0">
                                    {candidate.source}
                                </Badge>
                            </div>

                            {candidate.phone && (
                                <p className="text-xs text-zinc-400 font-mono mb-3">{candidate.phone}</p>
                            )}

                            {candidate.notes && (
                                <div className="mb-4 text-xs text-zinc-400 line-clamp-2 italic border-l-2 border-zinc-700 pl-2">
                                    "{candidate.notes}"
                                </div>
                            )}

                            <Button
                                variant="default"
                                size="sm"
                                className="w-full bg-purple-600 hover:bg-purple-500 text-white"
                                onClick={() => placeCall(candidate)}
                                disabled={callingId !== null}
                            >
                                {callingId === candidate.id ? (
                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Calling…</>
                                ) : (
                                    <><Phone className="h-4 w-4 mr-2" /> Call</>
                                )}
                            </Button>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};
