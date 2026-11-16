% Runs the Prolog spec (proofs/self_update.pl) on the 200 recorded inputs in
% io/self-update.jsonl, which come from running the JavaScript (npm run ios), and checks the spec
% gives every recorded output. So the JavaScript agrees with the proved spec on all 200.
%
% Run from the repo folder:  swipl -g check -t halt proofs/self_update_ios.pl

:- use_module(library(http/json)).
:- use_module('self_update.pl').

check :-
    setup_call_cleanup(open('io/self-update.jsonl', read, In, [encoding(utf8)]), read_lines(In, Lines), close(In)),
    length(Lines, N),
    ( N =:= 200 -> true ; format("Expected 200 examples, found ~w~n", [N]), halt(1) ),
    foldl(check_line, Lines, 0, Bad),
    ( Bad =:= 0 -> format("All ~w recorded inputs give the recorded outputs in the Prolog spec.~n", [N])
    ; format("~w of ~w examples differ from the Prolog spec.~n", [Bad, N]), halt(1) ).

read_lines(In, Ls) :-
    read_line_to_string(In, L),
    ( L == end_of_file -> Ls = [] ; L == "" -> read_lines(In, Ls) ; Ls = [L|T], read_lines(In, T) ).

check_line(Line, B0, B) :-
    atom_json_dict(Line, D, [value_string_as(string)]),
    get_dict(n, D, Num), get_dict(name, D, Name0), get_dict(input, D, Args), get_dict(output, D, Want),
    atom_string(Name, Name0),
    (   catch(self_update_spec:spec(Name, Args, Got), E, (print_message(error, E), fail)),
        norm(Got, G), norm(Want, W), G == W
    ->  B = B0
    ;   ( catch(self_update_spec:spec(Name, Args, G2), _, fail) -> true ; G2 = no_answer ),
        format("Example ~w (~w) differs:~n  recorded ~q~n  spec     ~q~n", [Num, Name, Want, G2]),
        B is B0 + 1 ).

% Dicts become sorted Key-Value lists, so tags and key order don't matter; numbers compare by value.
norm(D, N) :- is_dict(D), !, dict_pairs(D, _, Ps0), maplist([K-V, K-V1]>>norm(V, V1), Ps0, Ps), msort(Ps, N).
norm(L, N) :- is_list(L), !, maplist(norm, L, N).
norm(X, N) :- number(X), !, N is X * 1.0.
norm(X, X).
