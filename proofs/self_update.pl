% The Self-updating box's decisions, stated in Prolog, with proofs of what they guarantee.
%
% This is the specification of lib/self-update.js. Two things tie them together:
%   1. proofs/self_update_ios.pl runs this spec on the 200 recorded inputs in
%      io/self-update.jsonl (made by running the JavaScript) and checks every output.
%   2. The theorems below are proved by exhaustion: each is checked for every case in a
%      finite domain covering every branch (all JSON truth values, every subset and order
%      of a set of names, every way a line of install.sh can start).
%
% Run:  swipl -g main -t halt proofs/self_update.pl      (exit status 1 if a theorem fails)
% Values follow JSON as SWI-Prolog reads it: strings, numbers, true/false/null, dicts.

:- module(self_update_spec, [spec/3, main/0]).
:- use_module(library(lists)).
:- use_module(library(apply)).
:- discontiguous theorem/1.

old_lucianos("Update LucianOS first (git pull in your lucianos folder, then restart it) to use self-updating.").
not_installed("Lucian Office isn't in lucianos/apps, so there's nothing to update.").
about("Optional: LucianOS pulls Lucian Office's apps and tools from GitHub every few hours (fast-forward only; repos with your own changes are left alone)").

% JavaScript's Boolean(x) for JSON values (a missing key is undefined, which is false).
truthy(X, false) :- ( X == false ; X == null ; X == "" ; X == 0 ; X == 0.0 ), !.
truthy(_, true).
key(D, K, V) :- ( is_dict(D), get_dict(K, D, V0) -> V = V0 ; V = null ).

% ------------------------------------------------------------------ the definitions

% boxView(Status) -> view(Checked, Disabled, Title)
box_view(S, V) :- box_view_(S, V0), V = V0.   % steadfast: the clauses cut after their heads
box_view_(S, view(false, true, T)) :- ( S == null ; key(S, failed, F), truthy(F, true) ), !, old_lucianos(T).
box_view_(S, view(C, true, T)) :- key(S, officeInstalled, I), truthy(I, false), !, key(S, office, O), truthy(O, C), not_installed(T).
box_view_(S, view(C, false, T)) :- key(S, office, O), truthy(O, C), about(T).

% toggleMessage(On, EveryHours)
toggle_message(On, H, M) :- toggle_message_(On, H, M0), M = M0.   % steadfast
toggle_message_(On, _, "Self-updating is off.") :- truthy(On, false), !.
toggle_message_(_, H0, M) :-
    js_number(H0, H),
    ( H =:= 1 -> E = "every hour" ; format(string(E), "every ~w hours", [H]) ),
    format(string(M), "Self-updating is on: Lucian Office is checked ~w.", [E]).

js_number(X, X) :- number(X), !.
js_number(S, N) :- string(S), split_string(S, "", " \t\n\r", [T]), ( T == "" -> N = 0 ; number_string(N, T) ), !.

% installList(Script) -> lists(Apps, Tools)
install_list(Sh, lists(Apps, Tools)) :- for_apps(Sh, Apps), tool_lines(Sh, Tools).

% /for app in ([^;]+);/ : the text after the first "for app in " up to the next ";", if not empty.
for_apps(Sh, Apps) :-
    (   sub_string(Sh, B, _, _, "for app in "), !,
        Start is B + 11, sub_string(Sh, Start, _, 0, Rest),
        sub_string(Rest, Semi, _, _, ";"), !, Semi > 0,
        sub_string(Rest, 0, Semi, _, Inside),
        split_string(Inside, " \t\n\r", " \t\n\r", Parts),
        exclude(==(""), Parts, Apps)
    ->  true
    ;   Apps = [] ).

% /^get "\$TOOLS\/([^"]+)"/gm : lines that start exactly with get "$TOOLS/, up to the next quote.
tool_lines(Sh, Tools) :-
    split_string(Sh, "\n", "", Lines),
    convlist([L, T]>>( string_concat("get \"$TOOLS/", After, L), once(sub_string(After, Q, _, _, "\"")), Q > 0, sub_string(After, 0, Q, _, T) ), Lines, Tools).

% listsAgree(Json, Install) -> agree(Ok, MissingApps, ExtraApps, MissingTools, ExtraTools)
lists_agree(J, I, agree(Ok, MA, EA, MT, ET)) :-
    list_or_empty(J, apps, A), list_or_empty(J, tools, T),
    get_dict(apps, I, IA), get_dict(tools, I, IT),
    missing(IA, A, MA), missing(A, IA, EA), missing(IT, T, MT), missing(T, IT, ET),
    ( A == IA, T == IT -> Ok = true ; Ok = false ).
list_or_empty(J, K, L) :- key(J, K, V), ( is_list(V) -> L = V ; L = [] ).
missing(Want, Have, Out) :- exclude([N]>>memberchk(N, Have), Want, Out).

% ------------------------------------------------------------------ spec(Name, Args, JSON-shaped output)
spec(boxView, [S], _{checked: C, disabled: D, title: T}) :- box_view(S, view(C, D, T)).
spec(toggleMessage, [On, H], M) :- toggle_message(On, H, M).
spec(installList, [Sh], _{apps: A, tools: T}) :- install_list(Sh, lists(A, T)).
spec(listsAgree, [J, I], _{ok: Ok, missingApps: MA, extraApps: EA, missingTools: MT, extraTools: ET}) :- lists_agree(J, I, agree(Ok, MA, EA, MT, ET)).

% ------------------------------------------------------------------ theorems, proved by exhaustion

json_value(V) :- member(V, [true, false, null, 0, 1, "", "yes"]).
status(null).
status(_{failed: true}).
status(_{}).
status(S) :- json_value(O), json_value(I), member(Ks, [[office-O, officeInstalled-I], [office-O, officeInstalled-I, failed-false], [office-O]]), dict_pairs(S, _, Ks).
status(S) :- json_value(F), dict_pairs(S, _, [failed-F, office-true, officeInstalled-true]).

iff(A, B) :- ( call(A) -> call(B) ; \+ call(B) ).

% 1. The box always has exactly one view.
theorem(box_view_is_a_function) :-
    forall(status(S), findall(V, box_view(S, V), [view(C, D, T)])), forall(status(S), ( box_view(S, view(C, D, T)), b(C), b(D), string(T) )).
b(true). b(false).

% 2. Safety: when LucianOS can't say (too old, unreachable), the box is greyed out and never
%    claims self-updating is on.
theorem(unknown_means_off_and_greyed) :-
    forall(( status(S), ( S == null ; key(S, failed, F), truthy(F, true) ) ), box_view(S, view(false, true, _))).

% 3. The box can be clicked exactly when LucianOS answered and Lucian Office is installed,
%    and then it shows LucianOS's setting exactly.
theorem(enabled_box_mirrors_the_setting) :-
    forall(status(S),
           ( box_view(S, view(C, D, _)),
             iff(D == false, ( S \== null, key(S, failed, F), truthy(F, false), key(S, officeInstalled, I), truthy(I, true) )),
             ( D == false -> key(S, office, O), truthy(O, C) ; true ) )).

% 4. The message says "on" exactly when the box is on, and gives the hours.
theorem(message_matches_the_box) :-
    forall(( json_value(On), between(1, 168, H) ),
           ( toggle_message(On, H, M), truthy(On, T),
             ( T == false -> M == "Self-updating is off."
             ; sub_string(M, 0, _, _, "Self-updating is on"), ( H =:= 1 -> sub_string(M, _, _, _, "every hour.") ; format(string(E), "every ~w hours.", [H]), sub_string(M, _, _, _, E) ) ) )).

% Every list of distinct names drawn from Xs, in every order.
arrangement(Xs, Ys) :- subset_of(Xs, S), permutation(S, Ys).
subset_of([], []).
subset_of([X|Xs], [X|Ys]) :- subset_of(Xs, Ys).
subset_of([_|Xs], Ys) :- subset_of(Xs, Ys).

% 5. updates.json agrees with install.sh exactly when the lists are equal, and when the lists hold
%    the same names, disagreement can only be their order. The differences are exactly the
%    names one list has and the other hasn't.
theorem(lists_agree_exactly_when_equal) :-
    forall(( arrangement(["a", "b", "c"], A), arrangement(["a", "b", "d"], IA), arrangement(["m", "s"], T), arrangement(["m", "t"], IT) ),
           ( lists_agree(_{apps: A, tools: T}, _{apps: IA, tools: IT}, agree(Ok, MA, EA, MT, ET)),
             iff(Ok == true, ( A == IA, T == IT )),
             ( Ok == true -> MA == [], EA == [], MT == [], ET == [] ; true ),
             forall(member(N, MA), ( memberchk(N, IA), \+ memberchk(N, A) )),
             forall(( member(N, IA), \+ memberchk(N, A) ), memberchk(N, MA)),
             forall(member(N, EA), ( memberchk(N, A), \+ memberchk(N, IA) )),
             forall(( member(N, A), \+ memberchk(N, IA) ), memberchk(N, EA)),
             ( Ok == false, MA == [], EA == [], MT == [], ET == [] -> msort(A, S1), msort(IA, S1), msort(T, S2), msort(IT, S2) ; true ) )).

% 6. A missing or broken updates.json never agrees with a non-empty install.sh.
theorem(broken_json_never_agrees) :-
    forall(( member(J, [null, _{}, _{apps: "writer"}, _{tools: 3}]), arrangement(["a", "b"], IA), arrangement(["m"], IT), ( IA \== [] ; IT \== [] ) ),
           lists_agree(J, _{apps: IA, tools: IT}, agree(false, _, _, _, _))).

% 7. installList reads back exactly the apps and tools a script lists, however the for line is
%    spaced; and a get line that is indented or commented out is never read as a tool.
script(Apps, Tools, Sep, Pad, Sh) :-
    atomic_list_concat(Apps, Sep, AppText),
    format(string(For), "for app in ~w~w~w; do", [Pad, AppText, Pad]),
    maplist([T, L]>>format(string(L), "get \"$TOOLS/~w\" ~w", [T, T]), Tools, TLs),
    append([["#!/bin/sh", "set -e", For, "  get \"apps/$app\" \"$app\"", "done"], TLs, ["  get \"$TOOLS/indented\" x", "# get \"$TOOLS/commented\" x", "echo \"Done.\""]], Ls),
    atomic_list_concat(Ls, '\n', A), atom_string(A, Sh).
theorem(install_list_reads_back_what_it_lists) :-
    forall(( arrangement(["lucianoffice", "writer", "counter"], Apps), Apps \== [], arrangement(["mnns", "S2A2"], Tools),
             member(Sep, [" ", "  ", "\t"]), member(Pad, ["", " "]) ),
           ( script(Apps, Tools, Sep, Pad, Sh), install_list(Sh, lists(Apps1, Tools1)), Apps1 == Apps, Tools1 == Tools )).

main :-
    findall(T, clause(theorem(T), _), Ts),
    foldl([T, F0, F]>>( catch(theorem(T), E, (print_message(error, E), fail))
                         -> format("proved  ~w~n", [T]), F = F0
                         ;  format("FAILED  ~w~n", [T]), F is F0 + 1 ), Ts, 0, Failed),
    length(Ts, N),
    ( Failed =:= 0 -> format("~w theorems proved.~n", [N]) ; format("~w of ~w theorems failed.~n", [Failed, N]), halt(1) ).
