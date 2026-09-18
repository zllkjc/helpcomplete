export interface ParsedOptionValue {
  required: boolean;
  name: string;
}

export interface ParsedOption {
  short?: string;
  long?: string;
  description?: string;
  value?: ParsedOptionValue;
}

export interface ParsedCommand {
  name: string;
  description?: string;
}

export interface ParseResult {
  commands: ParsedCommand[];
  options: ParsedOption[];
}

export interface Parser {
  name: string;
  canParse(text: string): boolean;
  parse(text: string): ParseResult;
}
